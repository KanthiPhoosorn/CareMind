-- Migration 00007: Walk-in queue SECURITY DEFINER RPCs
-- Spec: docs/superpowers/specs/2026-05-11-walk-in-queue-design.md §6
--
-- Each function is SECURITY DEFINER so it runs with the migration owner's
-- privileges, bypassing the queue_tickets RLS policies. The functions do
-- their own scoping (hospital_id, patient_token, current_hospital_id()).
-- search_path is pinned to defeat the SECURITY DEFINER + mutable search_path
-- privilege-escalation pattern.

-- ── 1. create_walkin_ticket (anonymous) ──
CREATE OR REPLACE FUNCTION create_walkin_ticket(
  p_hospital_code TEXT,
  p_symptom_code  TEXT,
  p_severity      TEXT,
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
AS $func$
DECLARE
  v_hospital_id   UUID;
  v_department_id UUID;
  v_dept_code     TEXT;
  v_dept_name_th  TEXT;
  v_dept_name_en  TEXT;
  v_ticket_number INT;
  v_token         TEXT;
  v_otp           TEXT;
  v_priority      INT;
  v_ticket_id     UUID;
  v_position      INT;
BEGIN
  -- 1. Resolve hospital by code
  SELECT id INTO v_hospital_id FROM hospitals WHERE code = p_hospital_code;
  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'hospital_not_found: %', p_hospital_code USING ERRCODE = '22023';
  END IF;

  -- 2. Resolve routing rule (first match by priority asc, severity-specific beats wildcard)
  SELECT r.target_department_id, d.code, d.name_th, d.name_en
    INTO v_department_id, v_dept_code, v_dept_name_th, v_dept_name_en
  FROM routing_rules r
  JOIN departments  d ON d.id = r.target_department_id
  WHERE r.hospital_id  = v_hospital_id
    AND r.symptom_code = p_symptom_code
    AND r.is_active    = TRUE
    AND (r.severity = p_severity OR r.severity IS NULL)
  ORDER BY r.priority ASC
  LIMIT 1;

  IF v_department_id IS NULL THEN
    RAISE EXCEPTION 'no_routing_rule: hospital=% symptom=% severity=%',
      p_hospital_code, p_symptom_code, p_severity
      USING ERRCODE = '22023';
  END IF;

  -- 3. Per-(hospital, dept, day) ticket number.
  -- Uses the same IMMUTABLE day boundary as idx_queue_tickets_daily_number
  -- so this counter stays consistent with the uniqueness constraint
  -- regardless of session timezone.
  -- Table alias `t` is required because `ticket_number` is also a RETURNS
  -- TABLE OUT parameter on this function — bare column references would
  -- otherwise be ambiguous in PL/pgSQL scope.
  SELECT COALESCE(MAX(t.ticket_number), 0) + 1
    INTO v_ticket_number
    FROM queue_tickets t
   WHERE t.hospital_id  = v_hospital_id
     AND t.department_id = v_department_id
     AND ticket_day(t.created_at) = ticket_day(NOW());

  -- 4. Generate token and OTP
  v_token := encode(gen_random_bytes(24), 'base64');
  v_otp   := lpad(floor(random() * 1000000)::int::text, 6, '0');

  v_priority := CASE p_severity
    WHEN 'severe'   THEN 10
    WHEN 'moderate' THEN 50
    ELSE                 100
  END;

  -- 5. Insert
  INSERT INTO queue_tickets (
    hospital_id, department_id, ticket_number,
    phone_e164, symptom_code, severity, priority,
    patient_token_hash, otp_code_hash, otp_expires_at
  ) VALUES (
    v_hospital_id, v_department_id, v_ticket_number,
    p_phone_e164, p_symptom_code, p_severity, v_priority,
    encode(digest(v_token, 'sha256'), 'hex'),
    encode(digest(v_otp,   'sha256'), 'hex'),
    NOW() + INTERVAL '10 minutes'
  )
  RETURNING id INTO v_ticket_id;

  -- 6. Compute current queue position (own row inclusive)
  SELECT COUNT(*)::int INTO v_position
    FROM queue_tickets q2
   WHERE q2.hospital_id   = v_hospital_id
     AND q2.department_id = v_department_id
     AND q2.state         = 'waiting'
     AND (q2.priority, q2.created_at) <= (
       SELECT priority, created_at FROM queue_tickets WHERE id = v_ticket_id
     );

  -- 7. Audit
  INSERT INTO queue_ticket_events (ticket_id, from_state, to_state, actor)
  VALUES (v_ticket_id, NULL, 'waiting', NULL);

  RETURN QUERY SELECT
    v_ticket_id,
    v_ticket_number,
    v_dept_code,
    v_dept_name_th,
    v_dept_name_en,
    v_position,
    v_token,
    v_otp;
END;
$func$;

GRANT EXECUTE ON FUNCTION create_walkin_ticket(TEXT,TEXT,TEXT,TEXT,TEXT) TO anon;

-- ── 2. verify_walkin_ticket (anonymous) ──
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
BEGIN
  SELECT otp_code_hash, otp_expires_at, verified_at, otp_attempts
    INTO v_hash, v_expires, v_verified, v_attempts
    FROM queue_tickets
   WHERE id = p_ticket_id;

  IF v_hash IS NULL THEN
    RETURN QUERY SELECT FALSE;
    RETURN;
  END IF;

  -- Already verified is idempotent success
  IF v_verified IS NOT NULL THEN
    RETURN QUERY SELECT TRUE;
    RETURN;
  END IF;

  -- Locked out after 3 failures
  IF v_attempts >= 3 THEN
    RETURN QUERY SELECT FALSE;
    RETURN;
  END IF;

  -- Expired
  IF v_expires < NOW() THEN
    RETURN QUERY SELECT FALSE;
    RETURN;
  END IF;

  IF encode(digest(p_otp_code, 'sha256'), 'hex') = v_hash THEN
    UPDATE queue_tickets
       SET verified_at = NOW()
     WHERE id = p_ticket_id;
    INSERT INTO queue_ticket_events (ticket_id, from_state, to_state, actor)
    VALUES (p_ticket_id, 'waiting', 'waiting', NULL);
    RETURN QUERY SELECT TRUE;
  ELSE
    UPDATE queue_tickets
       SET otp_attempts = otp_attempts + 1
     WHERE id = p_ticket_id;
    RETURN QUERY SELECT FALSE;
  END IF;
END;
$func$;

GRANT EXECUTE ON FUNCTION verify_walkin_ticket(UUID,TEXT) TO anon;

-- ── 3. cancel_walkin_ticket (anonymous, token-gated) ──
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

  -- Only cancel from `waiting` or `called`; terminal states are no-ops
  IF v_state NOT IN ('waiting', 'called') THEN
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

GRANT EXECUTE ON FUNCTION cancel_walkin_ticket(UUID,TEXT) TO anon;

-- ── 4. call_next_ticket (staff) ──
CREATE OR REPLACE FUNCTION call_next_ticket(p_department_id UUID)
RETURNS TABLE (
  ticket_id       UUID,
  ticket_number   INT,
  symptom_code    TEXT,
  severity        TEXT,
  waited_seconds  INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_caller_hospital UUID;
  v_dept_hospital   UUID;
  v_ticket_id       UUID;
BEGIN
  v_caller_hospital := current_hospital_id();
  IF v_caller_hospital IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT hospital_id INTO v_dept_hospital FROM departments WHERE id = p_department_id;
  IF v_dept_hospital IS NULL OR v_dept_hospital <> v_caller_hospital THEN
    RAISE EXCEPTION 'department_not_in_hospital' USING ERRCODE = '42501';
  END IF;

  -- Lock the oldest waiting+verified row to avoid two staff calling the same one
  SELECT id INTO v_ticket_id
    FROM queue_tickets
   WHERE department_id = p_department_id
     AND state         = 'waiting'
     AND verified_at IS NOT NULL
   ORDER BY priority ASC, created_at ASC
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_ticket_id IS NULL THEN
    -- Empty queue
    RETURN QUERY SELECT NULL::UUID, NULL::INT, NULL::TEXT, NULL::TEXT, NULL::INT;
    RETURN;
  END IF;

  UPDATE queue_tickets
     SET state     = 'called',
         called_at = NOW(),
         called_by = auth.uid()
   WHERE id = v_ticket_id;

  INSERT INTO queue_ticket_events (ticket_id, from_state, to_state, actor)
  VALUES (v_ticket_id, 'waiting', 'called', auth.uid());

  RETURN QUERY
  SELECT q.id,
         q.ticket_number,
         q.symptom_code,
         q.severity,
         EXTRACT(EPOCH FROM (q.called_at - q.created_at))::int AS waited_seconds
    FROM queue_tickets q
   WHERE q.id = v_ticket_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION call_next_ticket(UUID) TO authenticated;

-- ── 5. mark_ticket_done (staff) ──
CREATE OR REPLACE FUNCTION mark_ticket_done(p_ticket_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_caller_hospital UUID;
  v_ticket_hospital UUID;
  v_state           TEXT;
BEGIN
  v_caller_hospital := current_hospital_id();
  IF v_caller_hospital IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT hospital_id, state
    INTO v_ticket_hospital, v_state
    FROM queue_tickets
   WHERE id = p_ticket_id;

  IF v_ticket_hospital IS NULL THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = '22023';
  END IF;

  IF v_ticket_hospital <> v_caller_hospital THEN
    RAISE EXCEPTION 'ticket_not_in_hospital' USING ERRCODE = '42501';
  END IF;

  IF v_state <> 'called' THEN
    RAISE EXCEPTION 'invalid_state_for_done: %', v_state USING ERRCODE = '22023';
  END IF;

  UPDATE queue_tickets
     SET state         = 'done',
         done_at       = NOW(),
         completed_by  = auth.uid()
   WHERE id = p_ticket_id;

  INSERT INTO queue_ticket_events (ticket_id, from_state, to_state, actor)
  VALUES (p_ticket_id, 'called', 'done', auth.uid());
END;
$func$;

GRANT EXECUTE ON FUNCTION mark_ticket_done(UUID) TO authenticated;

-- ── 6. mark_ticket_no_show (staff) ──
CREATE OR REPLACE FUNCTION mark_ticket_no_show(p_ticket_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_caller_hospital UUID;
  v_ticket_hospital UUID;
  v_state           TEXT;
BEGIN
  v_caller_hospital := current_hospital_id();
  IF v_caller_hospital IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT hospital_id, state
    INTO v_ticket_hospital, v_state
    FROM queue_tickets
   WHERE id = p_ticket_id;

  IF v_ticket_hospital IS NULL THEN
    RAISE EXCEPTION 'ticket_not_found' USING ERRCODE = '22023';
  END IF;

  IF v_ticket_hospital <> v_caller_hospital THEN
    RAISE EXCEPTION 'ticket_not_in_hospital' USING ERRCODE = '42501';
  END IF;

  IF v_state <> 'called' THEN
    RAISE EXCEPTION 'invalid_state_for_no_show: %', v_state USING ERRCODE = '22023';
  END IF;

  UPDATE queue_tickets
     SET state       = 'no_show',
         no_show_at  = NOW()
   WHERE id = p_ticket_id;

  INSERT INTO queue_ticket_events (ticket_id, from_state, to_state, actor)
  VALUES (p_ticket_id, 'called', 'no_show', auth.uid());
END;
$func$;

GRANT EXECUTE ON FUNCTION mark_ticket_no_show(UUID) TO authenticated;
