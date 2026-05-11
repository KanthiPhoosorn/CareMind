# Walk-in Queue M0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the database foundation (schema + RLS + seed + types) for the walk-in queue feature, unblocking the patient PWA (M1) and staff dashboard (M2) to develop in parallel against mocks.

**Architecture:** Extend the existing `hospital_id` + `current_hospital_id()` multi-tenant pattern (see `supabase/migrations/00002_multi_tenant.sql` and ADR-0001). Three new tables (`departments`, `routing_rules`, `queue_tickets`) plus an audit table (`queue_ticket_events`). Anonymous patient writes use defence-in-depth: an `INSERT` policy on `anon` + a `patient_token_hash` column verified by RPC. Migrations split into schema and RLS files so the RLS test step is independent of the schema test step.

**Tech Stack:** PostgreSQL 17 (Supabase), pgTAP for DB tests, TypeScript (hand-written `Database` interface in `shared/src/types/database.ts`), Vitest at the workspace root.

**Spec:** [`docs/superpowers/specs/2026-05-11-walk-in-queue-design.md`](../specs/2026-05-11-walk-in-queue-design.md)

---

## File Structure

### Files created in M0

| File                                                | Responsibility                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/00003_enable_pgtap.sql`        | Enable the `pgtap` extension once. Isolated so the test infra change is reviewable independently of any feature work. |
| `supabase/migrations/00004_walkin_queue_schema.sql` | All queue tables, CHECK constraints, indexes, the daily-number unique index. No RLS.                                  |
| `supabase/migrations/00005_walkin_queue_rls.sql`    | `ENABLE ROW LEVEL SECURITY` + policies for `anon` and `authenticated` on the four queue tables.                       |
| `supabase/tests/walkin_queue_schema_test.sql`       | pgTAP tests that verify the tables, columns, CHECKs, FKs, and the daily-number unique index exist as designed.        |
| `supabase/tests/walkin_queue_rls_test.sql`          | pgTAP tests for tenant isolation: anon can `INSERT` but not cross-read; staff scoped to own hospital.                 |
| `shared/src/types/queue.ts`                         | Source-of-truth TS unions: `SymptomCode`, `Severity`, `TicketState`, plus the `SEVERITY_PRIORITY` mapping constant.   |
| `shared/src/types/queue.test.ts`                    | Vitest spot-check that the unions and priority mapping line up with the spec.                                         |

### Files modified in M0

| File                           | Change                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `supabase/seed.sql`            | Append a `Departments` block and a `Routing rules` block. Idempotent via `ON CONFLICT DO NOTHING`. |
| `shared/src/types/database.ts` | Add the four new tables to the `Database['public']['Tables']` map.                                 |
| `shared/src/types/index.ts`    | `export * from './queue';`                                                                         |

### Files NOT touched in M0 (deferred)

- Any `web/app/(checkin)/...` route — that is M1.
- Any `web/app/(dashboard)/queue/...` route — that is M2.
- RPC functions (`create_walkin_ticket`, `call_next_ticket`, …) — M3.
- SMS dispatch infra — M3 / M4.

---

## Task 1: Enable pgTAP and verify the test runner

**Files:**

- Create: `supabase/migrations/00003_enable_pgtap.sql`
- Create: `supabase/tests/_smoke_test.sql`

- [ ] **Step 1.1: Create the pgTAP-enable migration**

Write `supabase/migrations/00003_enable_pgtap.sql`:

```sql
-- Migration 00003: Enable pgTAP for declarative DB tests
-- Used by `npx supabase test db` to run files under supabase/tests/

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
```

- [ ] **Step 1.2: Create the smoke test**

Write `supabase/tests/_smoke_test.sql`:

```sql
BEGIN;
SELECT plan(1);

SELECT has_extension('pgtap', 'pgTAP extension is installed');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 1.3: Apply the migration**

Run: `cd /mnt/d/CareMind && npx supabase db reset`
Expected: clean reset, `00003_enable_pgtap.sql` listed as applied. No errors.

- [ ] **Step 1.4: Run the smoke test**

Run: `cd /mnt/d/CareMind && npx supabase test db`
Expected output contains: `_smoke_test.sql .. ok` and `Result: PASS`.

- [ ] **Step 1.5: Commit**

```bash
cd /mnt/d/CareMind
git add supabase/migrations/00003_enable_pgtap.sql supabase/tests/_smoke_test.sql
git commit -m "chore: enable pgTAP for declarative DB tests"
```

---

## Task 2: pgTAP schema tests (RED)

**Files:**

- Create: `supabase/tests/walkin_queue_schema_test.sql`

This task writes the failing test that pins down the contract. The migration follows in Task 3.

- [ ] **Step 2.1: Write the schema test file**

Write `supabase/tests/walkin_queue_schema_test.sql`:

```sql
BEGIN;
SELECT plan(28);

-- ── Tables exist ──
SELECT has_table('public', 'departments', 'departments table exists');
SELECT has_table('public', 'routing_rules', 'routing_rules table exists');
SELECT has_table('public', 'queue_tickets', 'queue_tickets table exists');
SELECT has_table('public', 'queue_ticket_events', 'queue_ticket_events table exists');

-- ── departments columns ──
SELECT has_column('public', 'departments', 'hospital_id', 'departments.hospital_id exists');
SELECT has_column('public', 'departments', 'code', 'departments.code exists');
SELECT has_column('public', 'departments', 'no_show_seconds', 'departments.no_show_seconds exists');
SELECT col_default_is(
  'public', 'departments', 'no_show_seconds', '300',
  'departments.no_show_seconds defaults to 300'
);

-- ── routing_rules columns ──
SELECT has_column('public', 'routing_rules', 'symptom_code', 'routing_rules.symptom_code exists');
SELECT has_column('public', 'routing_rules', 'severity', 'routing_rules.severity exists');
SELECT has_column('public', 'routing_rules', 'target_department_id', 'routing_rules.target_department_id exists');
SELECT has_column('public', 'routing_rules', 'priority', 'routing_rules.priority exists');

-- ── queue_tickets columns ──
SELECT has_column('public', 'queue_tickets', 'hospital_id', 'queue_tickets.hospital_id exists');
SELECT has_column('public', 'queue_tickets', 'department_id', 'queue_tickets.department_id exists');
SELECT has_column('public', 'queue_tickets', 'ticket_number', 'queue_tickets.ticket_number exists');
SELECT has_column('public', 'queue_tickets', 'phone_e164', 'queue_tickets.phone_e164 exists');
SELECT has_column('public', 'queue_tickets', 'symptom_code', 'queue_tickets.symptom_code exists');
SELECT has_column('public', 'queue_tickets', 'severity', 'queue_tickets.severity exists');
SELECT has_column('public', 'queue_tickets', 'state', 'queue_tickets.state exists');
SELECT has_column('public', 'queue_tickets', 'patient_token_hash', 'queue_tickets.patient_token_hash exists');
SELECT has_column('public', 'queue_tickets', 'verified_at', 'queue_tickets.verified_at exists');

-- ── queue_tickets CHECK constraints ──
SELECT col_has_check('public', 'queue_tickets', 'state', 'state has a CHECK constraint');
SELECT col_has_check('public', 'queue_tickets', 'severity', 'severity has a CHECK constraint');

-- A row with an invalid state must fail
SELECT throws_ok(
  $$
    INSERT INTO queue_tickets (
      hospital_id, department_id, ticket_number,
      phone_e164, symptom_code, severity, state, patient_token_hash
    ) VALUES (
      gen_random_uuid(), gen_random_uuid(), 1,
      '+66891234567', 'cough', 'mild', 'not_a_state', 'hash'
    )
  $$,
  '23514',
  NULL,
  'invalid state is rejected by CHECK'
);

-- ── Indexes ──
SELECT has_index('public', 'queue_tickets', 'idx_queue_active',
  'partial index for active tickets exists');
SELECT has_index('public', 'queue_tickets', 'idx_queue_tickets_daily_number',
  'daily-number unique index exists');

-- ── Foreign keys ──
SELECT fk_ok('public', 'queue_tickets', 'hospital_id', 'public', 'hospitals', 'id',
  'queue_tickets.hospital_id → hospitals.id');
SELECT fk_ok('public', 'queue_tickets', 'department_id', 'public', 'departments', 'id',
  'queue_tickets.department_id → departments.id');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2.2: Run the test — expect RED**

Run: `cd /mnt/d/CareMind && npx supabase test db`
Expected: `walkin_queue_schema_test.sql .. FAILED` with errors like `relation "public.departments" does not exist`. The smoke test should still pass.

- [ ] **Step 2.3: Do NOT commit yet**

Schema tests and schema migration land together in Task 3's commit so the repo is never in a state where tests fail at HEAD.

---

## Task 3: Schema migration (GREEN)

**Files:**

- Create: `supabase/migrations/00004_walkin_queue_schema.sql`

- [ ] **Step 3.1: Write the schema migration**

Write `supabase/migrations/00004_walkin_queue_schema.sql`:

```sql
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
```

- [ ] **Step 3.2: Apply the migration**

Run: `cd /mnt/d/CareMind && npx supabase db reset`
Expected: all migrations apply cleanly through `00004`. No errors.

- [ ] **Step 3.3: Run the schema tests — expect GREEN**

Run: `cd /mnt/d/CareMind && npx supabase test db`
Expected output: `walkin_queue_schema_test.sql .. ok (28/28)` and `Result: PASS`.

- [ ] **Step 3.4: Commit schema + tests together**

```bash
cd /mnt/d/CareMind
git add supabase/migrations/00004_walkin_queue_schema.sql supabase/tests/walkin_queue_schema_test.sql
git commit -m "feat(db): add walk-in queue schema (tables + indexes)"
```

---

## Task 4: pgTAP RLS tests (RED)

**Files:**

- Create: `supabase/tests/walkin_queue_rls_test.sql`

The pattern uses Supabase's `set_config('request.jwt.claims', ...)` + `SET LOCAL ROLE` to simulate `anon` and a staff user from a specific hospital.

- [ ] **Step 4.1: Write the RLS test file**

Write `supabase/tests/walkin_queue_rls_test.sql`:

```sql
BEGIN;
SELECT plan(8);

-- ── Fixture: two hospitals, one dept each, one staff profile in hospital A ──
INSERT INTO hospitals (id, name, code) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Hospital A', 'HA'),
  ('22222222-2222-2222-2222-222222222222', 'Hospital B', 'HB');

INSERT INTO departments (id, hospital_id, code, name_th, name_en) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'GP', 'ทั่วไป', 'General'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '22222222-2222-2222-2222-222222222222', 'GP', 'ทั่วไป', 'General');

-- Fake auth user + profile in hospital A.
-- auth.users has many NOT NULL columns; insert the minimal set that the
-- local Supabase build accepts. profiles inherits id via FK + ON DELETE CASCADE.
INSERT INTO auth.users (
  id, instance_id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) VALUES (
  '99999999-9999-9999-9999-999999999991',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'staff-a@example.test',
  '',
  NOW(), NOW(), NOW(),
  '{}'::jsonb, '{}'::jsonb
);

INSERT INTO profiles (id, hospital_id, email, full_name, role)
  VALUES (
    '99999999-9999-9999-9999-999999999991',
    '11111111-1111-1111-1111-111111111111',
    'staff-a@example.test',
    'Staff A',
    'doctor'
  );

-- Seed a ticket in each hospital so cross-tenant reads have something to fail on
INSERT INTO queue_tickets (
  id, hospital_id, department_id, ticket_number,
  phone_e164, symptom_code, severity, patient_token_hash
) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   1, '+66891111111', 'cough', 'mild', 'hashA'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   1, '+66892222222', 'cough', 'mild', 'hashB');

-- ── Test 1: anon CAN insert a waiting ticket ──
SET LOCAL ROLE anon;
SELECT lives_ok(
  $$
    INSERT INTO queue_tickets (
      hospital_id, department_id, ticket_number,
      phone_e164, symptom_code, severity, state, patient_token_hash
    ) VALUES (
      '11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      99, '+66890000000', 'cough', 'mild', 'waiting', 'hashAnon'
    )
  $$,
  'anon can INSERT a waiting ticket'
);

-- ── Test 2: anon CANNOT insert a ticket already in a non-waiting state ──
SELECT throws_ok(
  $$
    INSERT INTO queue_tickets (
      hospital_id, department_id, ticket_number,
      phone_e164, symptom_code, severity, state, patient_token_hash
    ) VALUES (
      '11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      98, '+66890000001', 'cough', 'mild', 'called', 'hashCheat'
    )
  $$,
  '42501',
  NULL,
  'anon cannot INSERT a ticket in a non-waiting state'
);

-- ── Test 3: anon CANNOT SELECT any tickets directly ──
SELECT is_empty(
  $$ SELECT id FROM queue_tickets $$,
  'anon SELECT on queue_tickets returns no rows'
);

RESET ROLE;

-- ── Test 4-6: staff in hospital A sees only hospital A ──
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"99999999-9999-9999-9999-999999999991","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$ SELECT hospital_id::text FROM queue_tickets ORDER BY ticket_number $$,
  $$ VALUES ('11111111-1111-1111-1111-111111111111'),
            ('11111111-1111-1111-1111-111111111111') $$,
  'staff sees only own hospital tickets'
);

SELECT is_empty(
  $$ SELECT id FROM queue_tickets
     WHERE hospital_id = '22222222-2222-2222-2222-222222222222' $$,
  'staff cannot read other-hospital tickets'
);

SELECT results_eq(
  $$ SELECT code FROM departments $$,
  $$ VALUES ('GP') $$,
  'staff sees only own hospital departments'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ── Test 7: RLS is enabled on the three feature tables ──
SELECT ok(
  (SELECT relrowsecurity FROM pg_class
   WHERE oid = 'public.queue_tickets'::regclass),
  'RLS enabled on queue_tickets'
);

-- ── Test 8: routing_rules is staff-readable in own hospital only ──
INSERT INTO routing_rules (
  hospital_id, symptom_code, severity, target_department_id
) VALUES
  ('11111111-1111-1111-1111-111111111111', 'cough', NULL,
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'cough', NULL,
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"99999999-9999-9999-9999-999999999991","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$ SELECT hospital_id::text FROM routing_rules $$,
  $$ VALUES ('11111111-1111-1111-1111-111111111111') $$,
  'staff sees only own hospital routing rules'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 4.2: Run the RLS test — expect RED**

Run: `cd /mnt/d/CareMind && npx supabase test db`
Expected: `walkin_queue_rls_test.sql .. FAILED`. RLS is not yet enabled, so anon SELECT will return rows and Tests 3, 5, 6, 7, 8 will fail. The other test files should still pass.

- [ ] **Step 4.3: Do NOT commit yet**

RLS tests and the RLS migration land together in Task 5.

---

## Task 5: RLS migration (GREEN)

**Files:**

- Create: `supabase/migrations/00005_walkin_queue_rls.sql`

- [ ] **Step 5.1: Write the RLS migration**

Write `supabase/migrations/00005_walkin_queue_rls.sql`:

```sql
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
```

- [ ] **Step 5.2: Apply the migration**

Run: `cd /mnt/d/CareMind && npx supabase db reset`
Expected: all migrations through `00005` apply. No errors.

- [ ] **Step 5.3: Run the RLS tests — expect GREEN**

Run: `cd /mnt/d/CareMind && npx supabase test db`
Expected: `walkin_queue_rls_test.sql .. ok (8/8)`. All three test files pass.

- [ ] **Step 5.4: Commit RLS migration + tests**

```bash
cd /mnt/d/CareMind
git add supabase/migrations/00005_walkin_queue_rls.sql supabase/tests/walkin_queue_rls_test.sql
git commit -m "feat(db): add RLS policies for walk-in queue tables"
```

---

## Task 6: Seed departments and routing rules

**Files:**

- Modify: `supabase/seed.sql` (append new blocks at the bottom)

- [ ] **Step 6.1: Append departments and routing rules to `supabase/seed.sql`**

Add the following at the bottom of `supabase/seed.sql`, after the existing seed blocks:

```sql
-- ────────────────────────────────────────────────────────────────────────────
-- Walk-in Queue: Departments and Routing Rules
-- ────────────────────────────────────────────────────────────────────────────

-- Departments for the existing 'GHB' hospital (00000000-0000-0000-0000-000000000001)
INSERT INTO departments (id, hospital_id, code, name_th, name_en, no_show_seconds) VALUES
  ('aaaa0000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', 'GP',     'ทั่วไป',      'General Practice',  300),
  ('aaaa0000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001', 'INTMED', 'อายุรกรรม',   'Internal Medicine', 300),
  ('aaaa0000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001', 'DERM',   'ผิวหนัง',     'Dermatology',       300),
  ('aaaa0000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000001', 'ENT',    'หู คอ จมูก',   'ENT',               300),
  ('aaaa0000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000001', 'OPHTH',  'จักษุ',       'Ophthalmology',     300),
  ('aaaa0000-0000-0000-0000-000000000006',
   '00000000-0000-0000-0000-000000000001', 'ORTHO',  'กระดูก',      'Orthopedics',       300),
  ('aaaa0000-0000-0000-0000-000000000007',
   '00000000-0000-0000-0000-000000000001', 'ER',     'ฉุกเฉิน',     'Emergency',         120)
ON CONFLICT DO NOTHING;

-- Routing rules: (symptom_code, severity → department). NULL severity = any.
-- `priority` ASC = first match wins.
INSERT INTO routing_rules (hospital_id, symptom_code, severity, target_department_id, priority) VALUES
  ('00000000-0000-0000-0000-000000000001', 'cough',   NULL,       'aaaa0000-0000-0000-0000-000000000002', 100),
  ('00000000-0000-0000-0000-000000000001', 'fever',   'severe',   'aaaa0000-0000-0000-0000-000000000002', 10),
  ('00000000-0000-0000-0000-000000000001', 'fever',   NULL,       'aaaa0000-0000-0000-0000-000000000001', 100),
  ('00000000-0000-0000-0000-000000000001', 'stomach', 'severe',   'aaaa0000-0000-0000-0000-000000000002', 10),
  ('00000000-0000-0000-0000-000000000001', 'stomach', NULL,       'aaaa0000-0000-0000-0000-000000000001', 100),
  ('00000000-0000-0000-0000-000000000001', 'injury',  'severe',   'aaaa0000-0000-0000-0000-000000000007', 10),
  ('00000000-0000-0000-0000-000000000001', 'injury',  NULL,       'aaaa0000-0000-0000-0000-000000000006', 100),
  ('00000000-0000-0000-0000-000000000001', 'skin',    NULL,       'aaaa0000-0000-0000-0000-000000000003', 100),
  ('00000000-0000-0000-0000-000000000001', 'eye_ent', NULL,       'aaaa0000-0000-0000-0000-000000000004', 100),
  ('00000000-0000-0000-0000-000000000001', 'other',   NULL,       'aaaa0000-0000-0000-0000-000000000001', 100)
ON CONFLICT DO NOTHING;
```

- [ ] **Step 6.2: Re-seed the local DB**

Run: `cd /mnt/d/CareMind && npx supabase db reset`
Expected: applies migrations through `00005` and runs `seed.sql`. No errors.

- [ ] **Step 6.3: Verify seeded rows**

The local Supabase DB runs on port `54322` per `supabase/config.toml`. Default credentials are `postgres` / `postgres`, database `postgres`. Run:

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c \
  "SELECT COUNT(*) AS dept_count FROM departments
   WHERE hospital_id = '00000000-0000-0000-0000-000000000001';"

PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c \
  "SELECT COUNT(*) AS rule_count FROM routing_rules
   WHERE hospital_id = '00000000-0000-0000-0000-000000000001';"
```

Expected: `dept_count` = 7, `rule_count` = 10.

- [ ] **Step 6.4: Commit**

```bash
cd /mnt/d/CareMind
git add supabase/seed.sql
git commit -m "feat(db): seed OPD departments and routing rules for walk-in queue"
```

---

## Task 7: Shared TypeScript types

**Files:**

- Create: `shared/src/types/queue.ts`
- Create: `shared/src/types/queue.test.ts`
- Modify: `shared/src/types/index.ts`
- Modify: `shared/src/types/database.ts`

- [ ] **Step 7.1: Create `shared/src/types/queue.ts`**

Write `shared/src/types/queue.ts`:

```ts
// Walk-in queue domain types — mirror the DB CHECK constraints in
// supabase/migrations/00004_walkin_queue_schema.sql

export const SYMPTOM_CODES = [
  'cough',
  'fever',
  'stomach',
  'injury',
  'skin',
  'eye_ent',
  'other',
] as const;
export type SymptomCode = (typeof SYMPTOM_CODES)[number];

export const SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const TICKET_STATES = ['waiting', 'called', 'done', 'no_show', 'cancelled'] as const;
export type TicketState = (typeof TICKET_STATES)[number];

// Severity → priority (lower = served sooner). See spec §3.2.
export const SEVERITY_PRIORITY: Record<Severity, number> = {
  mild: 100,
  moderate: 50,
  severe: 10,
};

export const TERMINAL_TICKET_STATES: readonly TicketState[] = ['done', 'no_show', 'cancelled'];
```

- [ ] **Step 7.2: Create `shared/src/types/queue.test.ts`**

Write `shared/src/types/queue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  SYMPTOM_CODES,
  SEVERITIES,
  TICKET_STATES,
  SEVERITY_PRIORITY,
  TERMINAL_TICKET_STATES,
} from './queue';

describe('queue domain types', () => {
  it('lists the seven walk-in symptom codes', () => {
    expect(SYMPTOM_CODES).toEqual([
      'cough',
      'fever',
      'stomach',
      'injury',
      'skin',
      'eye_ent',
      'other',
    ]);
  });

  it('lists three severities', () => {
    expect(SEVERITIES).toEqual(['mild', 'moderate', 'severe']);
  });

  it('lists five ticket states', () => {
    expect(TICKET_STATES).toEqual(['waiting', 'called', 'done', 'no_show', 'cancelled']);
  });

  it('maps severity to monotonically decreasing priority values', () => {
    expect(SEVERITY_PRIORITY.severe).toBeLessThan(SEVERITY_PRIORITY.moderate);
    expect(SEVERITY_PRIORITY.moderate).toBeLessThan(SEVERITY_PRIORITY.mild);
  });

  it('marks done / no_show / cancelled as terminal', () => {
    expect(TERMINAL_TICKET_STATES).toEqual(['done', 'no_show', 'cancelled']);
  });
});
```

- [ ] **Step 7.3: Export queue types from `shared/src/types/index.ts`**

Modify `shared/src/types/index.ts`. Current content:

```ts
export * from './patient';
export * from './database';
```

Change to:

```ts
export * from './patient';
export * from './database';
export * from './queue';
```

- [ ] **Step 7.4: Extend `shared/src/types/database.ts` with queue tables**

In `shared/src/types/database.ts`, inside `Database['public']['Tables']`, add the following four entries. Place them after the last existing table entry. Use the type imports already at the top of the file for primitive types.

Add an import at the top of the file (only if not already present):

```ts
import type { SymptomCode, Severity, TicketState } from './queue';
```

Then inside `Tables: { ... }`, add:

```ts
departments: {
  Row: {
    id: string;
    hospital_id: string;
    code: string;
    name_th: string;
    name_en: string;
    is_active: boolean;
    no_show_seconds: number;
    created_at: string;
  };
  Insert: Omit<
    Database['public']['Tables']['departments']['Row'],
    'id' | 'created_at' | 'is_active' | 'no_show_seconds'
  > & {
    is_active?: boolean;
    no_show_seconds?: number;
  };
  Update: Partial<Database['public']['Tables']['departments']['Insert']>;
};

routing_rules: {
  Row: {
    id: string;
    hospital_id: string;
    symptom_code: SymptomCode;
    severity: Severity | null;
    target_department_id: string;
    priority: number;
    is_active: boolean;
    created_at: string;
  };
  Insert: Omit<
    Database['public']['Tables']['routing_rules']['Row'],
    'id' | 'created_at' | 'is_active' | 'priority'
  > & {
    is_active?: boolean;
    priority?: number;
  };
  Update: Partial<Database['public']['Tables']['routing_rules']['Insert']>;
};

queue_tickets: {
  Row: {
    id: string;
    hospital_id: string;
    department_id: string;
    ticket_number: number;
    phone_e164: string;
    symptom_code: SymptomCode;
    severity: Severity;
    priority: number;
    state: TicketState;
    created_at: string;
    verified_at: string | null;
    called_at: string | null;
    done_at: string | null;
    cancelled_at: string | null;
    no_show_at: string | null;
    patient_token_hash: string;
    called_by: string | null;
    completed_by: string | null;
  };
  Insert: Omit<
    Database['public']['Tables']['queue_tickets']['Row'],
    | 'id'
    | 'created_at'
    | 'verified_at'
    | 'called_at'
    | 'done_at'
    | 'cancelled_at'
    | 'no_show_at'
    | 'called_by'
    | 'completed_by'
    | 'priority'
    | 'state'
  > & {
    priority?: number;
    state?: TicketState;
  };
  Update: Partial<Database['public']['Tables']['queue_tickets']['Insert']>;
};

queue_ticket_events: {
  Row: {
    id: number;
    ticket_id: string;
    from_state: TicketState | null;
    to_state: TicketState;
    actor: string | null;
    occurred_at: string;
  };
  Insert: Omit<
    Database['public']['Tables']['queue_ticket_events']['Row'],
    'id' | 'occurred_at'
  >;
  Update: Partial<Database['public']['Tables']['queue_ticket_events']['Insert']>;
};
```

- [ ] **Step 7.5: Run the unit test**

Run: `cd /mnt/d/CareMind && npm run test -- shared/src/types/queue.test.ts`
Expected: `Test Files  1 passed (1)` and `Tests  5 passed (5)`.

- [ ] **Step 7.6: Run type-check across all workspaces**

Run: `cd /mnt/d/CareMind && npm run type-check`
Expected: all workspaces type-check green. If `web` or `mobile` import from `@caremind/shared` and now fail because something downstream depended on a stale shape, fix the import side rather than mutating the new types — but in M0 there are no downstream consumers yet.

- [ ] **Step 7.7: Commit**

```bash
cd /mnt/d/CareMind
git add shared/src/types/queue.ts shared/src/types/queue.test.ts \
        shared/src/types/index.ts shared/src/types/database.ts
git commit -m "feat(shared): add walk-in queue domain types and DB type rows"
```

---

## Task 8: End-to-end M0 verification

This task runs every check from a clean slate. No new files; only verification.

- [ ] **Step 8.1: Full database reset from scratch**

Run: `cd /mnt/d/CareMind && npx supabase db reset`
Expected: every migration `00001` through `00005` applies; `seed.sql` runs without errors; the output ends with `Finished supabase db reset`.

- [ ] **Step 8.2: All pgTAP tests green**

Run: `cd /mnt/d/CareMind && npx supabase test db`
Expected: three test files reported, every line ends in `ok`, final summary `Result: PASS`. Tests count totals:

- `_smoke_test.sql` — 1 test
- `walkin_queue_schema_test.sql` — 28 tests
- `walkin_queue_rls_test.sql` — 8 tests

- [ ] **Step 8.3: All Vitest suites green**

Run: `cd /mnt/d/CareMind && npm run test`
Expected: existing `constants.test.ts` plus the new `queue.test.ts` pass. Zero failures.

- [ ] **Step 8.4: Type-check green**

Run: `cd /mnt/d/CareMind && npm run type-check`
Expected: all workspaces complete with no `error TS` output.

- [ ] **Step 8.5: Lint green**

Run: `cd /mnt/d/CareMind && npm run lint`
Expected: zero warnings, zero errors (lint-staged runs ESLint with `--max-warnings=0` on commit, so a green pre-commit run already confirmed this on each task, but re-run as a final gate).

- [ ] **Step 8.6: Verify the seeded routing path resolves correctly**

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
  SELECT d.code AS target_dept
  FROM routing_rules r
  JOIN departments d ON d.id = r.target_department_id
  WHERE r.hospital_id = '00000000-0000-0000-0000-000000000001'
    AND r.symptom_code = 'injury'
    AND (r.severity = 'severe' OR r.severity IS NULL)
    AND r.is_active = TRUE
  ORDER BY r.priority ASC
  LIMIT 1;
"
```

Expected output: a single row with `target_dept = 'ER'` (the severity='severe' rule has `priority=10` so it wins over the `priority=100` fallback).

- [ ] **Step 8.7: Tag the M0 milestone**

```bash
cd /mnt/d/CareMind
git tag -a walkin-queue-m0 -m "Walk-in queue M0: schema + RLS + seed + types"
```

(Push the tag separately with `git push origin walkin-queue-m0` when the team's ready — not part of this task.)

- [ ] **Step 8.8: Update the spec's decisions log**

Append to the decisions log table in `docs/superpowers/specs/2026-05-11-walk-in-queue-design.md`:

```markdown
| 2026-05-11 | Split the M0 migration into `00004_walkin_queue_schema.sql` + `00005_walkin_queue_rls.sql` | Migrations are append-only; pairing schema-test/RLS-test with their own migration keeps RED→GREEN cycles clean and review-scoped |
```

Commit:

```bash
cd /mnt/d/CareMind
git add docs/superpowers/specs/2026-05-11-walk-in-queue-design.md
git commit -m "docs(spec): log M0 migration split decision"
```

---

## Out-of-scope for M0 — explicit non-goals

The following are intentionally NOT in this plan and belong to later slices:

- RPC functions (`create_walkin_ticket`, `verify_walkin_ticket`, `call_next_ticket`, `mark_ticket_done`, `mark_ticket_no_show`, `cancel_walkin_ticket`) — M3.
- Background job for OTP-unverified ticket sweep — M3.
- Background job for `called → no_show` auto-transition — M4.
- SMS provider integration and dispatch worker — M4.
- Wait-time estimation table, view, or function — M5.
- Hospital admin UI for managing departments and routing rules — deferred.
- Any `web/app/(checkin)/...` or `web/app/(dashboard)/queue/...` route — M1 / M2.

If a task ahead of M0 needs one of these contracts (for example, M1 needs a mocked `createWalkinTicket` response shape), build it as a typed mock against `shared/src/types/queue.ts` and `shared/src/types/database.ts`. Do **not** start an RPC migration to satisfy a mock — that belongs to M3.

---

## Spec coverage check

| Spec section                                                                               | Covered by                                                           |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| §3.1 Tables (departments, routing_rules, queue_tickets, queue_ticket_events)               | Task 3                                                               |
| §3.1 Indexes (`idx_queue_active`, `idx_queue_tickets_daily_number`, `idx_routing_lookup`)  | Task 3                                                               |
| §3.2 Severity → priority mapping                                                           | Task 7 (`SEVERITY_PRIORITY` constant); enforced by app layer, not DB |
| §3.3 State machine constraints                                                             | Task 3 (CHECK on `state`); transition rules belong to M3 RPCs        |
| §4.2 RLS policies (anon insert, staff read/update queue, staff read departments + routing) | Task 5                                                               |
| §4.3 Anonymous-ticket security — `patient_token_hash` column                               | Task 3                                                               |
| §10 M0 deliverable: schema + RLS + seed + types + pgTAP RLS tests                          | All eight tasks together                                             |
| §11 Test strategy — pgTAP for RLS and schema                                               | Tasks 2, 4                                                           |
| §12 PHI handling — retention sweep                                                         | Deferred to M3 (RPC + cron) — flagged here                           |

PHI retention (§12) is **not** implemented in M0 because the sweep needs the same background-job infra introduced for OTP cleanup in M3. The retention requirement is recorded; no PHI is at risk in M0 because no production tickets exist yet.
