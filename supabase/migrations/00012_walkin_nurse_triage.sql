-- Migration 00012: Nurse-mediated triage
-- Replaces patient self-rating with a nurse-assigned severity at check-in.
--
-- New flow:
--   1. Patient picks symptom only and submits phone/OTP.
--   2. Ticket is created in `pending_triage` state, scoped to the hospital's
--      TRIAGE department. Severity is NULL until a clinician assigns it.
--   3. Staff opens the triage view, picks a ticket, assigns severity.
--   4. The triage_walkin_ticket() RPC then re-routes the ticket to its real
--      OPD department (via routing_rules) and issues a fresh ticket_number
--      scoped to that department.
--
-- Backward-compat note: the old (symptom, severity)-at-create flow is dropped
-- entirely. create_walkin_ticket() loses its p_severity parameter; the
-- frontend is updated in the same change.

-- 1. Allow 'pending_triage' as a ticket state
ALTER TABLE queue_tickets DROP CONSTRAINT queue_tickets_state_check;
ALTER TABLE queue_tickets
  ADD CONSTRAINT queue_tickets_state_check
    CHECK (state IN ('pending_triage', 'waiting', 'called', 'done', 'no_show', 'cancelled'));

-- 2. Severity is now only known after triage. Allow NULL until then.
ALTER TABLE queue_tickets DROP CONSTRAINT queue_tickets_severity_check;
ALTER TABLE queue_tickets ALTER COLUMN severity DROP NOT NULL;
ALTER TABLE queue_tickets
  ADD CONSTRAINT queue_tickets_severity_check
    CHECK (severity IS NULL OR severity IN ('mild', 'moderate', 'severe'));

-- Severity / state coherence:
--   * pending_triage  → severity MUST be NULL (triage hasn't happened)
--   * waiting / called / done / no_show → severity MUST be set
--   * cancelled → severity may be NULL (cancelled pre-triage) or set
--     (cancelled post-triage). Either is valid.
ALTER TABLE queue_tickets
  ADD CONSTRAINT queue_tickets_severity_state_consistency
    CHECK (
      (state = 'pending_triage' AND severity IS NULL)
      OR
      (state IN ('waiting', 'called', 'done', 'no_show') AND severity IS NOT NULL)
      OR
      (state = 'cancelled')
    );

-- 3. Seed a TRIAGE department for every hospital that already exists.
INSERT INTO departments (id, hospital_id, code, name_th, name_en, no_show_seconds)
SELECT
  gen_random_uuid(),
  h.id,
  'TRIAGE',
  'จุดคัดกรอง',
  'Triage',
  600
FROM hospitals h
WHERE NOT EXISTS (
  SELECT 1 FROM departments d
   WHERE d.hospital_id = h.id AND d.code = 'TRIAGE'
);

-- 4. Rebuild create_walkin_ticket without p_severity.
-- Tickets land in the hospital's TRIAGE department in pending_triage state.
DROP FUNCTION IF EXISTS create_walkin_ticket(TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_walkin_ticket(
  p_hospital_code TEXT,
  p_symptom_code  TEXT,
  p_phone_e164    TEXT,
  p_locale        TEXT DEFAULT 'th'
)
RETURNS TABLE (
  ticket_id          UUID,
  ticket_number      INT,
  department_code    TEXT,
  department_name_th TEXT,
  department_name_en TEXT,
  position_in_queue  INT,
  patient_token      TEXT,
  otp_code           TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hospital_id    UUID;
  v_triage_dept_id UUID;
  v_triage_code    TEXT;
  v_triage_name_th TEXT;
  v_triage_name_en TEXT;
  v_ticket_number  INT;
  v_token          TEXT;
  v_otp            TEXT;
  v_ticket_id      UUID;
  v_position       INT;
BEGIN
  -- 1. Hospital lookup
  SELECT id INTO v_hospital_id FROM hospitals WHERE code = p_hospital_code;
  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'hospital_not_found: %', p_hospital_code USING ERRCODE = '22023';
  END IF;

  -- 2. Validate symptom code matches what we accept (mirrors CHECK semantics
  -- on routing_rules without coupling to it — symptom is meaningful even
  -- before a routing rule fires post-triage).
  IF p_symptom_code NOT IN ('cough', 'fever', 'stomach', 'injury', 'skin', 'eye_ent', 'other') THEN
    RAISE EXCEPTION 'invalid_symptom_code: %', p_symptom_code USING ERRCODE = '22023';
  END IF;

  -- 3. Resolve TRIAGE department for this hospital
  SELECT d.id, d.code, d.name_th, d.name_en
    INTO v_triage_dept_id, v_triage_code, v_triage_name_th, v_triage_name_en
    FROM departments d
   WHERE d.hospital_id = v_hospital_id
     AND d.code = 'TRIAGE';

  IF v_triage_dept_id IS NULL THEN
    RAISE EXCEPTION 'triage_department_missing_for_hospital: %', p_hospital_code
      USING ERRCODE = '22023';
  END IF;

  -- 4. Per-(hospital, TRIAGE dept, day) ticket number
  SELECT COALESCE(MAX(t.ticket_number), 0) + 1
    INTO v_ticket_number
    FROM queue_tickets t
   WHERE t.hospital_id  = v_hospital_id
     AND t.department_id = v_triage_dept_id
     AND ticket_day(t.created_at) = ticket_day(NOW());

  -- 5. Token + OTP
  v_token := encode(extensions.gen_random_bytes(24), 'base64');
  v_otp   := lpad(floor(random() * 1000000)::int::text, 6, '0');

  -- 6. Insert ticket in pending_triage / TRIAGE dept / no severity
  INSERT INTO queue_tickets (
    hospital_id, department_id, ticket_number,
    phone_e164, symptom_code, severity, priority, state,
    patient_token_hash, otp_code_hash, otp_expires_at, otp_attempts
  ) VALUES (
    v_hospital_id, v_triage_dept_id, v_ticket_number,
    p_phone_e164, p_symptom_code, NULL, 100, 'pending_triage',
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    encode(extensions.digest(v_otp,   'sha256'), 'hex'),
    NOW() + INTERVAL '10 minutes',
    0
  ) RETURNING id INTO v_ticket_id;

  -- Audit: ticket created in pending_triage. Mirrors the audit pattern used
  -- by verify/triage/call/done/no_show RPCs.
  INSERT INTO queue_ticket_events (ticket_id, from_state, to_state, actor)
  VALUES (v_ticket_id, NULL, 'pending_triage', NULL);

  -- 7. Position in the triage queue (other pending_triage tickets ahead)
  SELECT COUNT(*) + 1 INTO v_position
    FROM queue_tickets t
   WHERE t.hospital_id = v_hospital_id
     AND t.department_id = v_triage_dept_id
     AND t.state = 'pending_triage'
     AND t.ticket_number < v_ticket_number;

  ticket_id          := v_ticket_id;
  ticket_number      := v_ticket_number;
  department_code    := v_triage_code;
  department_name_th := v_triage_name_th;
  department_name_en := v_triage_name_en;
  position_in_queue  := v_position;
  patient_token      := v_token;
  otp_code           := v_otp;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION create_walkin_ticket(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_walkin_ticket(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 5. triage_walkin_ticket: nurse assigns severity + re-routes the ticket.
CREATE OR REPLACE FUNCTION triage_walkin_ticket(
  p_ticket_id UUID,
  p_severity  TEXT
)
RETURNS TABLE (
  ticket_id              UUID,
  ticket_number          INT,
  department_code        TEXT,
  department_name_th     TEXT,
  department_name_en     TEXT,
  severity               TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller_hospital UUID;
  v_ticket          RECORD;
  v_target_dept_id  UUID;
  v_target_code     TEXT;
  v_target_th       TEXT;
  v_target_en       TEXT;
  v_new_number      INT;
  v_priority        INT;
BEGIN
  IF p_severity NOT IN ('mild', 'moderate', 'severe') THEN
    RAISE EXCEPTION 'invalid_severity: %', p_severity USING ERRCODE = '22023';
  END IF;

  v_caller_hospital := current_hospital_id();
  IF v_caller_hospital IS NULL THEN
    RAISE EXCEPTION 'no_hospital_context' USING ERRCODE = '42501';
  END IF;

  SELECT t.id, t.hospital_id, t.symptom_code, t.state
    INTO v_ticket
    FROM queue_tickets t
   WHERE t.id = p_ticket_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = '22023';
  END IF;
  IF v_ticket.hospital_id <> v_caller_hospital THEN
    RAISE EXCEPTION 'cross_hospital_triage_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_ticket.state <> 'pending_triage' THEN
    RAISE EXCEPTION 'ticket_not_pending_triage: state=%', v_ticket.state
      USING ERRCODE = '22023';
  END IF;

  -- Resolve target dept via routing_rules. Severity-specific rules win over
  -- the NULL-severity fallback (the priority ASC ordering already encodes
  -- this — severe rules use priority 10, fallbacks use 100).
  SELECT r.target_department_id, d.code, d.name_th, d.name_en
    INTO v_target_dept_id, v_target_code, v_target_th, v_target_en
    FROM routing_rules r
    JOIN departments d ON d.id = r.target_department_id
   WHERE r.hospital_id = v_caller_hospital
     AND r.is_active = TRUE
     AND r.symptom_code = v_ticket.symptom_code
     AND (r.severity = p_severity OR r.severity IS NULL)
   ORDER BY (r.severity = p_severity) DESC, r.priority ASC
   LIMIT 1;

  IF v_target_dept_id IS NULL THEN
    RAISE EXCEPTION 'no_routing_rule_for: symptom=% severity=%',
      v_ticket.symptom_code, p_severity USING ERRCODE = '22023';
  END IF;

  -- Issue a fresh ticket_number scoped to the target department for today
  SELECT COALESCE(MAX(t.ticket_number), 0) + 1
    INTO v_new_number
    FROM queue_tickets t
   WHERE t.hospital_id = v_caller_hospital
     AND t.department_id = v_target_dept_id
     AND ticket_day(t.created_at) = ticket_day(NOW());

  v_priority := CASE p_severity
                  WHEN 'severe'   THEN 10
                  WHEN 'moderate' THEN 50
                  ELSE 100
                END;

  UPDATE queue_tickets
     SET state         = 'waiting',
         severity      = p_severity,
         department_id = v_target_dept_id,
         ticket_number = v_new_number,
         priority      = v_priority
   WHERE id = p_ticket_id;

  INSERT INTO queue_ticket_events (ticket_id, from_state, to_state, actor)
  VALUES (p_ticket_id, 'pending_triage', 'waiting', auth.uid());

  ticket_id          := p_ticket_id;
  ticket_number      := v_new_number;
  department_code    := v_target_code;
  department_name_th := v_target_th;
  department_name_en := v_target_en;
  severity           := p_severity;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION triage_walkin_ticket(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION triage_walkin_ticket(UUID, TEXT) TO authenticated;

-- 6. Update get_ticket_wait_estimate so patients in pending_triage see a
-- meaningful position-in-triage-queue rather than 0/0. A pending_triage
-- ticket has no department-specific position yet, so we count pending_triage
-- tickets ahead of it within the same TRIAGE dept. We also add four more
-- output columns so the patient page can rerender after triage re-issues
-- a ticket_number under a new department.
--
-- DROP first because RETURNS TABLE shape is changing — CREATE OR REPLACE
-- would refuse "cannot change return type".
DROP FUNCTION IF EXISTS get_ticket_wait_estimate(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_ticket_wait_estimate(
  p_ticket_id      UUID,
  p_patient_token  TEXT
)
RETURNS TABLE (
  state                     TEXT,
  position_in_queue         INTEGER,
  estimated_wait_minutes    INTEGER,
  current_ticket_number     INTEGER,
  current_department_code   TEXT,
  current_department_name_th TEXT,
  current_department_name_en TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_hash    TEXT;
  v_ticket        RECORD;
  v_position      INTEGER;
BEGIN
  v_token_hash := encode(extensions.digest(p_patient_token, 'sha256'), 'hex');

  SELECT t.id, t.department_id, t.priority, t.ticket_number, t.state,
         t.patient_token_hash, d.code AS dept_code, d.name_th AS dept_th, d.name_en AS dept_en
    INTO v_ticket
    FROM queue_tickets t
    JOIN departments d ON d.id = t.department_id
   WHERE t.id = p_ticket_id;

  IF NOT FOUND OR v_ticket.patient_token_hash <> v_token_hash THEN
    RAISE EXCEPTION 'ticket_not_found_or_token_mismatch'
      USING ERRCODE = '42501';
  END IF;

  current_ticket_number      := v_ticket.ticket_number;
  current_department_code    := v_ticket.dept_code;
  current_department_name_th := v_ticket.dept_th;
  current_department_name_en := v_ticket.dept_en;

  IF v_ticket.state = 'pending_triage' THEN
    SELECT COUNT(*) + 1 INTO v_position
      FROM queue_tickets q
     WHERE q.department_id = v_ticket.department_id
       AND q.state = 'pending_triage'
       AND q.ticket_number < v_ticket.ticket_number;
    state := 'pending_triage';
    position_in_queue := v_position;
    estimated_wait_minutes := GREATEST(0, v_position * 5);
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_ticket.state NOT IN ('waiting', 'called') THEN
    state := v_ticket.state;
    position_in_queue := 0;
    estimated_wait_minutes := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_position
    FROM queue_tickets q
   WHERE q.department_id = v_ticket.department_id
     AND q.state = 'waiting'
     AND (
       q.priority < v_ticket.priority
       OR (q.priority = v_ticket.priority AND q.ticket_number < v_ticket.ticket_number)
     );

  IF v_ticket.state = 'called' THEN
    v_position := 0;
  ELSE
    v_position := v_position + 1;
  END IF;

  state := v_ticket.state;
  position_in_queue := v_position;
  estimated_wait_minutes := estimate_wait_minutes(v_ticket.department_id, v_position);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION get_ticket_wait_estimate(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_ticket_wait_estimate(UUID, TEXT) TO anon, authenticated;

-- 7. Fix verify_walkin_ticket's audit emission. The M0 version hardcoded
-- from_state='waiting' to_state='waiting' which was already wrong (verify
-- doesn't change state, and didn't apply even pre-Phase-E if you read the
-- audit log literally). With pending_triage now in the picture, the
-- hardcoded 'waiting' is misleading. Read the actual current state and
-- emit (state, state) so the audit row records "OTP verified" without
-- implying a state transition.
CREATE OR REPLACE FUNCTION verify_walkin_ticket(
  p_ticket_id UUID,
  p_otp_code  TEXT
)
RETURNS TABLE (ok BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_hash       TEXT;
  v_expires    TIMESTAMPTZ;
  v_verified   TIMESTAMPTZ;
  v_attempts   SMALLINT;
  v_state      TEXT;
BEGIN
  SELECT otp_code_hash, otp_expires_at, verified_at, otp_attempts, state
    INTO v_hash, v_expires, v_verified, v_attempts, v_state
    FROM queue_tickets
   WHERE id = p_ticket_id;

  IF v_hash IS NULL THEN
    RETURN QUERY SELECT FALSE;
    RETURN;
  END IF;

  IF v_verified IS NOT NULL THEN
    RETURN QUERY SELECT TRUE;
    RETURN;
  END IF;

  IF v_attempts >= 3 THEN
    RETURN QUERY SELECT FALSE;
    RETURN;
  END IF;

  IF v_expires < NOW() THEN
    RETURN QUERY SELECT FALSE;
    RETURN;
  END IF;

  IF encode(digest(p_otp_code, 'sha256'), 'hex') = v_hash THEN
    UPDATE queue_tickets
       SET verified_at = NOW()
     WHERE id = p_ticket_id;
    INSERT INTO queue_ticket_events (ticket_id, from_state, to_state, actor)
    VALUES (p_ticket_id, v_state, v_state, NULL);
    RETURN QUERY SELECT TRUE;
  ELSE
    UPDATE queue_tickets
       SET otp_attempts = otp_attempts + 1
     WHERE id = p_ticket_id;
    RETURN QUERY SELECT FALSE;
  END IF;
END;
$func$;

-- 8. Widen cancel_walkin_ticket to allow pre-triage cancellation. Patients
-- can abandon a ticket while it's still pending_triage (e.g. they walked in,
-- got the OTP, then changed their mind before a nurse saw them).
CREATE OR REPLACE FUNCTION cancel_walkin_ticket(
  p_ticket_id     UUID,
  p_patient_token TEXT
)
RETURNS TABLE (ok BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_token_hash TEXT;
  v_state      TEXT;
BEGIN
  SELECT patient_token_hash, state
    INTO v_token_hash, v_state
    FROM queue_tickets
   WHERE id = p_ticket_id;

  IF v_token_hash IS NULL THEN
    RETURN QUERY SELECT FALSE;
    RETURN;
  END IF;

  IF encode(digest(p_patient_token, 'sha256'), 'hex') <> v_token_hash THEN
    RETURN QUERY SELECT FALSE;
    RETURN;
  END IF;

  -- Cancel-eligible states: pending_triage (added in Phase E), waiting, called.
  -- Terminal states (done/no_show/cancelled) are no-ops.
  IF v_state NOT IN ('pending_triage', 'waiting', 'called') THEN
    RETURN QUERY SELECT FALSE;
    RETURN;
  END IF;

  UPDATE queue_tickets
     SET state = 'cancelled',
         cancelled_at = NOW()
   WHERE id = p_ticket_id;

  INSERT INTO queue_ticket_events (ticket_id, from_state, to_state, actor)
  VALUES (p_ticket_id, v_state, 'cancelled', NULL);

  RETURN QUERY SELECT TRUE;
END;
$func$;
