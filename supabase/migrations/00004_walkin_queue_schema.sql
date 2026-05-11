-- Migration 00004: Walk-in queue schema (tables + indexes, no RLS)
-- Spec: docs/superpowers/specs/2026-05-11-walk-in-queue-design.md §3

-- ── 1. departments ──
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name_th TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  no_show_seconds INT NOT NULL DEFAULT 300,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, code)
);

CREATE INDEX idx_departments_hospital ON departments(hospital_id, is_active);

-- ── 2. routing_rules ──
CREATE TABLE routing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  symptom_code TEXT NOT NULL,
  severity TEXT,
  target_department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (severity IS NULL OR severity IN ('mild', 'moderate', 'severe'))
);

CREATE INDEX idx_routing_lookup
  ON routing_rules(hospital_id, symptom_code, is_active, priority);

-- ── 3. queue_tickets ──
CREATE TABLE queue_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,

  ticket_number INT NOT NULL,

  phone_e164 TEXT NOT NULL,
  symptom_code TEXT NOT NULL,
  severity TEXT NOT NULL,

  priority INT NOT NULL DEFAULT 100,
  state TEXT NOT NULL DEFAULT 'waiting',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  called_at TIMESTAMPTZ,
  done_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  no_show_at TIMESTAMPTZ,

  patient_token_hash TEXT NOT NULL,

  called_by UUID REFERENCES profiles(id),
  completed_by UUID REFERENCES profiles(id),

  CHECK (state IN ('waiting', 'called', 'done', 'no_show', 'cancelled')),
  CHECK (severity IN ('mild', 'moderate', 'severe'))
);

-- Active-queue lookup: serves the staff dashboard and routing math
CREATE INDEX idx_queue_active
  ON queue_tickets(hospital_id, department_id, state, priority, created_at)
  WHERE state IN ('waiting', 'called');

-- Human-friendly ticket numbers are unique per (hospital, dept, calendar day).
-- Functional expression requires a unique INDEX, not a UNIQUE table constraint.
CREATE UNIQUE INDEX idx_queue_tickets_daily_number
  ON queue_tickets(hospital_id, department_id, ticket_number, (created_at::date));

-- ── 4. queue_ticket_events (audit) ──
CREATE TABLE queue_ticket_events (
  id BIGSERIAL PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES queue_tickets(id) ON DELETE CASCADE,
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor UUID REFERENCES profiles(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_queue_ticket_events_ticket
  ON queue_ticket_events(ticket_id, occurred_at);
