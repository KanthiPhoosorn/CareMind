-- Migration 00005: Walk-in queue RLS
-- Spec: docs/superpowers/specs/2026-05-11-walk-in-queue-design.md §4

-- ── Enable RLS on all four tables ──
ALTER TABLE departments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_rules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_ticket_events ENABLE ROW LEVEL SECURITY;

-- ── queue_tickets ──

-- Anonymous patient: INSERT only, and only into `waiting` state.
-- The application also goes through a SECURITY DEFINER RPC for validation
-- and rate limiting; this policy is the defence-in-depth backstop.
CREATE POLICY "anon_insert_walkin"
  ON queue_tickets FOR INSERT TO anon
  WITH CHECK (state = 'waiting');

-- Staff: hospital-scoped SELECT
CREATE POLICY "staff_read_queue"
  ON queue_tickets FOR SELECT TO authenticated
  USING (hospital_id = current_hospital_id());

-- Staff: hospital-scoped UPDATE (RPCs gate the state machine)
CREATE POLICY "staff_update_queue"
  ON queue_tickets FOR UPDATE TO authenticated
  USING (hospital_id = current_hospital_id())
  WITH CHECK (hospital_id = current_hospital_id());

-- ── departments ──

CREATE POLICY "staff_read_departments"
  ON departments FOR SELECT TO authenticated
  USING (hospital_id = current_hospital_id());

-- ── routing_rules ──

CREATE POLICY "staff_read_routing"
  ON routing_rules FOR SELECT TO authenticated
  USING (hospital_id = current_hospital_id());

-- ── queue_ticket_events ──

-- Staff can read events for tickets in their hospital
CREATE POLICY "staff_read_events"
  ON queue_ticket_events FOR SELECT TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM queue_tickets
      WHERE hospital_id = current_hospital_id()
    )
  );
