-- Migration 00008: sms_dispatch_log
-- Records every outbound SMS attempt for the walk-in queue (and future
-- features). Important for ops debugging — when a patient says "I never
-- got the SMS", we need to see whether we sent it, when, and what the
-- provider response was.
--
-- Foreign key to queue_tickets so we can audit per-ticket dispatch history.
-- Rows are append-only; we never UPDATE state here. If a retry happens it
-- inserts a new row.

CREATE TABLE sms_dispatch_log (
  id              BIGSERIAL PRIMARY KEY,
  ticket_id       UUID NOT NULL REFERENCES queue_tickets(id) ON DELETE CASCADE,
  to_phone        TEXT NOT NULL,
  body            TEXT NOT NULL,
  provider        TEXT NOT NULL,
  message_id      TEXT,
  error           TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sms_dispatch_ticket ON sms_dispatch_log(ticket_id, sent_at DESC);
CREATE INDEX idx_sms_dispatch_recent ON sms_dispatch_log(sent_at DESC);

-- RLS: only staff in the ticket's hospital can read dispatch history.
-- Insert is locked to service_role / authenticated server actions — the anon
-- patient flow never writes to this table.
ALTER TABLE sms_dispatch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_sms_dispatch" ON sms_dispatch_log
  FOR SELECT
  TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM queue_tickets WHERE hospital_id = current_hospital_id()
    )
  );

CREATE POLICY "auth_insert_sms_dispatch" ON sms_dispatch_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ticket_id IN (
      SELECT id FROM queue_tickets WHERE hospital_id = current_hospital_id()
    )
  );
