-- Migration 00009: No-show sweeper
-- A patient is marked 'no_show' if a staff member called them and they didn't
-- present within a configurable timeout (default: per-department
-- no_show_seconds, fallback 600s = 10 min). The sweeper runs on a cron schedule
-- in production (pg_cron is available on Supabase hosted); locally we expose
-- the function so it can be invoked manually via an admin endpoint.
--
-- search_path is pinned to public+extensions so cron.schedule() doesn't have
-- to know about our schema layout.

CREATE OR REPLACE FUNCTION sweep_stale_called_tickets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH stale AS (
    UPDATE queue_tickets t
       SET state = 'no_show',
           no_show_at = NOW()
      FROM departments d
     WHERE t.department_id = d.id
       AND t.state = 'called'
       AND t.called_at IS NOT NULL
       AND t.called_at < NOW() - (COALESCE(d.no_show_seconds, 600) * INTERVAL '1 second')
     RETURNING t.id, t.called_by
  ),
  ins AS (
    INSERT INTO queue_ticket_events (ticket_id, from_state, to_state, actor)
    SELECT id, 'called', 'no_show', called_by FROM stale
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION sweep_stale_called_tickets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sweep_stale_called_tickets() TO service_role;

-- pg_cron scheduling. This is wrapped in a DO block so the migration doesn't
-- error when pg_cron isn't available (e.g. local supabase start which omits
-- it). Production-on-Supabase has the extension preinstalled in `extensions`.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions';
    PERFORM extensions.cron.schedule(
      'walkin-sweep-no-shows',
      '* * * * *',
      $cron$SELECT sweep_stale_called_tickets();$cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Don't fail migration if cron registration fails in restricted environments.
  RAISE NOTICE 'pg_cron registration skipped: %', SQLERRM;
END $$;
