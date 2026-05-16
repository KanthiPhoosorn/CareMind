-- Migration 00011: get_ticket_wait_estimate
-- Patient-facing read endpoint. Anonymous, authenticated via patient_token
-- (same scheme used by cancel_walkin_ticket). Returns current position in
-- the dept queue plus a wait estimate in minutes.
--
-- We recompute position here instead of trusting whatever localStorage holds
-- because the queue moves: a patient who got position 5 at 09:00 might be
-- position 2 by the time they reload the page.

CREATE OR REPLACE FUNCTION get_ticket_wait_estimate(
  p_ticket_id      UUID,
  p_patient_token  TEXT
)
RETURNS TABLE (
  state                     TEXT,
  position_in_queue         INTEGER,
  estimated_wait_minutes    INTEGER
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

  SELECT t.id, t.department_id, t.priority, t.ticket_number, t.state, t.patient_token_hash
    INTO v_ticket
    FROM queue_tickets t
   WHERE t.id = p_ticket_id;

  IF NOT FOUND OR v_ticket.patient_token_hash <> v_token_hash THEN
    RAISE EXCEPTION 'ticket_not_found_or_token_mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF v_ticket.state NOT IN ('waiting', 'called') THEN
    -- Terminal state: nothing left to estimate.
    state := v_ticket.state;
    position_in_queue := 0;
    estimated_wait_minutes := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Count tickets ahead in the same dept (same ordering as call_next_ticket)
  SELECT COUNT(*) INTO v_position
    FROM queue_tickets q
   WHERE q.department_id = v_ticket.department_id
     AND q.state = 'waiting'
     AND (
       q.priority < v_ticket.priority
       OR (q.priority = v_ticket.priority AND q.ticket_number < v_ticket.ticket_number)
     );

  -- If the patient is already 'called', position is 0; otherwise +1 to
  -- include the patient themselves in the position-from-front count.
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
