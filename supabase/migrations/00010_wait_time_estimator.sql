-- Migration 00010: Wait-time estimator
-- Per-department expected wait in minutes, computed from the recent 24h of
-- completed tickets (state IN done/no_show). Falls back to a sensible default
-- when there isn't enough history yet (cold start on a new department).
--
-- We measure called_at - created_at because that's the patient-perceptible
-- wait, not done_at - created_at which folds in the consultation duration.

CREATE OR REPLACE FUNCTION estimate_wait_minutes(
  p_department_id UUID,
  p_position      INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_avg_interval_minutes NUMERIC;
  v_default_minutes      INTEGER := 8;
BEGIN
  IF p_position IS NULL OR p_position < 0 THEN
    RETURN 0;
  END IF;

  SELECT AVG(EXTRACT(EPOCH FROM (called_at - created_at)) / 60.0)
    INTO v_avg_interval_minutes
    FROM queue_tickets
   WHERE department_id = p_department_id
     AND state IN ('done', 'no_show')
     AND called_at IS NOT NULL
     AND called_at > NOW() - INTERVAL '24 hours';

  IF v_avg_interval_minutes IS NULL OR v_avg_interval_minutes < 1 THEN
    v_avg_interval_minutes := v_default_minutes;
  END IF;

  RETURN GREATEST(0, ROUND(p_position * v_avg_interval_minutes)::INTEGER);
END;
$$;

REVOKE ALL ON FUNCTION estimate_wait_minutes(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION estimate_wait_minutes(UUID, INTEGER) TO anon, authenticated;

-- Daily department stats for the staff dashboard. A view rather than a
-- function so the dashboard can subscribe to it without an RPC round trip.
CREATE OR REPLACE VIEW queue_dept_stats_today AS
SELECT
  d.id   AS department_id,
  d.code AS department_code,
  d.hospital_id,
  COUNT(*) FILTER (WHERE t.state = 'done')          AS calls_done_today,
  COUNT(*) FILTER (WHERE t.state = 'no_show')       AS no_shows_today,
  COUNT(*) FILTER (WHERE t.state = 'waiting')       AS waiting_now,
  ROUND(
    AVG(EXTRACT(EPOCH FROM (t.called_at - t.created_at)) / 60.0)
      FILTER (WHERE t.state IN ('done', 'no_show') AND t.called_at IS NOT NULL)
  )::INTEGER AS avg_wait_minutes_today
FROM departments d
LEFT JOIN queue_tickets t
       ON t.department_id = d.id
      AND t.created_at >= date_trunc('day', NOW())
GROUP BY d.id, d.code, d.hospital_id;

-- The view inherits queue_tickets RLS so staff only see their own hospital.
GRANT SELECT ON queue_dept_stats_today TO authenticated;
