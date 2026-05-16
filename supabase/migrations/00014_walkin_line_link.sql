-- Migration 00014: line_link_code column + link_line_user_id RPC
--
-- Patients link their LINE account to a ticket by sending a prefilled
-- "LINK-XXXXXXXX" message to the hospital LINE OA. The webhook
-- (web/app/api/line/webhook/route.ts) extracts the code and calls
-- link_line_user_id() to populate queue_tickets.line_user_id, which the
-- Phase F.1 dispatcher (web/app/(dashboard)/queue/actions.ts) already
-- consumes.
--
-- See docs/superpowers/specs/2026-05-14-line-oa-webhook-design.md

-- 1. Per-ticket link code. 8 uppercase hex chars, DB-generated so
--    create_walkin_ticket needs no change. The DEFAULT backfills existing
--    rows. pgcrypto already lives in the `extensions` schema.
ALTER TABLE queue_tickets
  ADD COLUMN line_link_code TEXT NOT NULL
    DEFAULT upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));

COMMENT ON COLUMN queue_tickets.line_link_code IS
  'Short code embedded in the patient LINE deep link. Matched by link_line_user_id().';

-- 2. Re-create get_ticket_wait_estimate with two extra output columns so the
--    patient ticket page (which already polls this RPC every 30s) can render
--    the LINE button and flip it to "linked" with no new query.
--    DROP first — RETURNS TABLE shape is changing, CREATE OR REPLACE refuses
--    "cannot change return type" (same constraint hit in migration 00012).
DROP FUNCTION IF EXISTS get_ticket_wait_estimate(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_ticket_wait_estimate(
  p_ticket_id      UUID,
  p_patient_token  TEXT
)
RETURNS TABLE (
  state                      TEXT,
  position_in_queue          INTEGER,
  estimated_wait_minutes     INTEGER,
  current_ticket_number      INTEGER,
  current_department_code    TEXT,
  current_department_name_th TEXT,
  current_department_name_en TEXT,
  line_link_code             TEXT,
  line_user_id               TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_hash  TEXT;
  v_ticket      RECORD;
  v_position    INTEGER;
BEGIN
  v_token_hash := encode(extensions.digest(p_patient_token, 'sha256'), 'hex');

  SELECT t.id, t.department_id, t.priority, t.ticket_number, t.state,
         t.patient_token_hash, t.line_link_code, t.line_user_id,
         d.code AS dept_code, d.name_th AS dept_th, d.name_en AS dept_en
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
  line_link_code             := v_ticket.line_link_code;
  line_user_id               := v_ticket.line_user_id;

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

-- 3. link_line_user_id: matches an active ticket by its line_link_code and
--    stores the patient's LINE userId. Idempotent. SECURITY DEFINER so the
--    webhook can call it with the anon key, like the rest of the check-in
--    flow. ORDER BY created_at DESC LIMIT 1 defensively handles the
--    (effectively impossible) 8-hex-char collision by taking the newest.
CREATE OR REPLACE FUNCTION link_line_user_id(
  p_link_code     TEXT,
  p_line_user_id  TEXT
)
RETURNS TABLE (
  ok                 BOOLEAN,
  reason             TEXT,
  ticket_number      INTEGER,
  department_name_th TEXT,
  department_name_en TEXT,
  state              TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ticket RECORD;
BEGIN
  SELECT t.id, t.state, t.ticket_number, t.line_user_id,
         d.name_th AS dept_th, d.name_en AS dept_en
    INTO v_ticket
    FROM queue_tickets t
    JOIN departments d ON d.id = t.department_id
   WHERE t.line_link_code = upper(p_link_code)
   ORDER BY t.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    ok := false; reason := 'not_found';
    RETURN NEXT; RETURN;
  END IF;

  ticket_number      := v_ticket.ticket_number;
  department_name_th := v_ticket.dept_th;
  department_name_en := v_ticket.dept_en;
  state              := v_ticket.state;

  IF v_ticket.state NOT IN ('pending_triage', 'waiting', 'called') THEN
    ok := false; reason := 'closed';
    RETURN NEXT; RETURN;
  END IF;

  IF v_ticket.line_user_id IS NULL THEN
    UPDATE queue_tickets
       SET line_user_id = p_line_user_id
     WHERE id = v_ticket.id;
    ok := true; reason := 'linked';
    RETURN NEXT; RETURN;
  END IF;

  IF v_ticket.line_user_id = p_line_user_id THEN
    ok := true; reason := 'already_linked';
    RETURN NEXT; RETURN;
  END IF;

  ok := false; reason := 'taken';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION link_line_user_id(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_line_user_id(TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION link_line_user_id(TEXT, TEXT) IS
  'Links a LINE userId to a ticket via its line_link_code. Idempotent. Called by the LINE OA webhook.';
