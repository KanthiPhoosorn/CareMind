# Walk-in Queue M3a Implementation Plan — SECURITY DEFINER RPCs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the six SECURITY DEFINER PL/pgSQL functions that drive the walk-in queue state machine, so the API layer (M3b) and frontend mocks (M1/M2) have a real contract to call.

**Architecture:** Six RPCs hosted in a single migration. Each function does one verb of the state machine (`create`, `verify`, `cancel`, `call_next`, `mark_done`, `mark_no_show`) and emits an `queue_ticket_events` row for audit. Patient-side RPCs (`create`, `verify`, `cancel`) are exposed to `anon`; staff RPCs (`call_next`, `mark_done`, `mark_no_show`) require `authenticated` and self-scope by `current_hospital_id()`. OTP and patient token are SHA-256 hashed in storage; raw values are returned exactly once at creation. A small ALTER ships first to add the three OTP columns the new RPCs need.

**Tech Stack:** PL/pgSQL, SECURITY DEFINER, pgcrypto (`digest`, `gen_random_bytes`), pgTAP. No Node, no Next.js, no external HTTP.

**Spec:** [`docs/superpowers/specs/2026-05-11-walk-in-queue-design.md`](../specs/2026-05-11-walk-in-queue-design.md) §3, §4.2, §4.3, §6.

**Out of scope for M3a:**

- API route handlers (`web/app/api/queue/...`) — that is M3b
- SMS dispatch / Twilio integration — that is M4
- Background no-show sweeper — that is M4
- Wait-time math — that is M5
- Rate limiting (sits in API middleware, not the DB) — M3b

---

## File Structure

### Files created in M3a

| File                                               | Responsibility                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/00006_walkin_otp_columns.sql` | ALTER queue_tickets to add `otp_code_hash`, `otp_expires_at`, `otp_attempts`. Enables pgcrypto if not present. |
| `supabase/tests/walkin_queue_otp_test.sql`         | pgTAP tests proving the OTP columns exist with correct types and defaults.                                     |
| `supabase/migrations/00007_walkin_queue_rpcs.sql`  | The six SECURITY DEFINER functions plus GRANT statements.                                                      |
| `supabase/tests/walkin_queue_rpcs_test.sql`        | pgTAP tests for the RPC behaviours: routing, state machine, token verification, scoping.                       |

### Files NOT touched in M3a

- Any `web/app/api/queue/...` route — M3b
- Any frontend file — M1 / M2
- `shared/src/types/database.ts` — no new tables, just three new columns; we'll update the type in M3b alongside the API contracts
- `supabase/seed.sql` — no new seed needed

---

## Task 1: OTP columns migration + pgTAP test

**Files:**

- Create: `supabase/migrations/00006_walkin_otp_columns.sql`
- Create: `supabase/tests/walkin_queue_otp_test.sql`

- [ ] **Step 1.1: Write the OTP test (RED)**

Write `supabase/tests/walkin_queue_otp_test.sql`:

```sql
BEGIN;
SELECT plan(6);

SELECT has_column('public', 'queue_tickets', 'otp_code_hash',
  'queue_tickets.otp_code_hash exists');
SELECT has_column('public', 'queue_tickets', 'otp_expires_at',
  'queue_tickets.otp_expires_at exists');
SELECT has_column('public', 'queue_tickets', 'otp_attempts',
  'queue_tickets.otp_attempts exists');

SELECT col_type_is('public', 'queue_tickets', 'otp_code_hash', 'text',
  'otp_code_hash is TEXT');
SELECT col_type_is('public', 'queue_tickets', 'otp_expires_at', 'timestamp with time zone',
  'otp_expires_at is TIMESTAMPTZ');
SELECT col_default_is('public', 'queue_tickets', 'otp_attempts', '0',
  'otp_attempts defaults to 0');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 1.2: Run the test — expect RED**

Run: `cd /mnt/d/CareMind && npx supabase test db`
Expected: `walkin_queue_otp_test.sql .. FAILED`. Existing tests (`_smoke_test.sql`, `walkin_queue_schema_test.sql`, `walkin_queue_rls_test.sql`) should still pass.

- [ ] **Step 1.3: Write the OTP columns migration**

Write `supabase/migrations/00006_walkin_otp_columns.sql`:

```sql
-- Migration 00006: Add OTP columns to queue_tickets and enable pgcrypto
-- Spec: docs/superpowers/specs/2026-05-11-walk-in-queue-design.md §6.1
--
-- These columns hold the OTP that gates ticket verification.
-- otp_code_hash:  SHA-256(otp) - never store the raw OTP
-- otp_expires_at: 10 minutes after create
-- otp_attempts:   incremented on each failed verify; locks out at 3

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE queue_tickets
  ADD COLUMN otp_code_hash  TEXT,
  ADD COLUMN otp_expires_at TIMESTAMPTZ,
  ADD COLUMN otp_attempts   SMALLINT NOT NULL DEFAULT 0;
```

- [ ] **Step 1.4: Apply and re-run the test — expect GREEN**

Run: `cd /mnt/d/CareMind && npx supabase db reset && npx supabase test db`
Expected: `walkin_queue_otp_test.sql .. ok (6/6)`. All four test files pass.

- [ ] **Step 1.5: Commit**

```bash
cd /mnt/d/CareMind
git add supabase/migrations/00006_walkin_otp_columns.sql \
        supabase/tests/walkin_queue_otp_test.sql
git commit -m "feat(db): add OTP columns to queue_tickets for ticket verification"
```

---

## Task 2: RPC pgTAP tests (RED)

**Files:**

- Create: `supabase/tests/walkin_queue_rpcs_test.sql`

This is the failing-test step. We write the contract here; Task 3 makes it pass.

- [ ] **Step 2.1: Write the RPC test file**

Write `supabase/tests/walkin_queue_rpcs_test.sql`:

```sql
BEGIN;
SELECT plan(18);

-- ── Fixture: one hospital, two depts, routing rule for cough → INTMED ──
INSERT INTO hospitals (id, name, code) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Hospital A', 'HA');

INSERT INTO departments (id, hospital_id, code, name_th, name_en) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'INTMED', 'อายุรกรรม', 'Internal Medicine'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '11111111-1111-1111-1111-111111111111', 'ER',     'ฉุกเฉิน',  'Emergency');

INSERT INTO routing_rules (hospital_id, symptom_code, severity, target_department_id, priority) VALUES
  ('11111111-1111-1111-1111-111111111111', 'cough',  NULL,     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 100),
  ('11111111-1111-1111-1111-111111111111', 'injury', 'severe', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 10);

-- Staff profile in hospital A (for staff RPC tests)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) VALUES (
  '99999999-9999-9999-9999-999999999991',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'staff-a@example.test', '',
  NOW(), NOW(), NOW(), '{}'::jsonb, '{}'::jsonb
);

INSERT INTO profiles (id, hospital_id, email, full_name, role)
  VALUES ('99999999-9999-9999-9999-999999999991',
          '11111111-1111-1111-1111-111111111111',
          'staff-a@example.test', 'Staff A', 'doctor');

-- ── Tests 1-5: create_walkin_ticket ──

-- Test 1: anonymous create returns a ticket with INTMED routing
SET LOCAL ROLE anon;
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM create_walkin_ticket('HA', 'cough', 'mild', '+66890000001', 'th');
  PERFORM ok(r.ticket_id IS NOT NULL,         'Test 1a: create returns a ticket_id');
  PERFORM ok(r.ticket_number = 1,             'Test 1b: first ticket of the day is #1');
  PERFORM ok(r.department_code = 'INTMED',    'Test 1c: cough/mild routes to INTMED');
  PERFORM ok(length(r.patient_token) >= 24,   'Test 1d: patient_token is returned and non-trivial');
  PERFORM ok(r.otp_code ~ '^\d{6}$',          'Test 1e: otp_code is a 6-digit string');
END $$;

-- Test 2: severity bumps routing to ER
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM create_walkin_ticket('HA', 'injury', 'severe', '+66890000002', 'th');
  PERFORM ok(r.department_code = 'ER',
    'Test 2: injury+severe routes to ER (priority 10 wins over fallback)');
END $$;

-- Test 3: unknown hospital code raises
SELECT throws_ok(
  $$ SELECT * FROM create_walkin_ticket('ZZZ', 'cough', 'mild', '+66890000003', 'th') $$,
  '22023',
  NULL,
  'Test 3: unknown hospital code raises 22023'
);

-- Test 4: no routing rule for symptom raises
SELECT throws_ok(
  $$ SELECT * FROM create_walkin_ticket('HA', 'unmapped_symptom', 'mild', '+66890000004', 'th') $$,
  '22023',
  NULL,
  'Test 4: missing routing rule raises 22023'
);

-- Test 5: per-day ticket number is monotonic
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM create_walkin_ticket('HA', 'cough', 'mild', '+66890000005', 'th');
  PERFORM ok(r.ticket_number = 2,
    'Test 5: second ticket of the day is #2');
END $$;

RESET ROLE;

-- ── Tests 6-9: verify_walkin_ticket ──

-- Set up: create a ticket and capture its OTP and id
DO $$
DECLARE r record; v_otp text; v_id uuid;
BEGIN
  SET LOCAL ROLE anon;
  SELECT * INTO r FROM create_walkin_ticket('HA', 'cough', 'mild', '+66890000010', 'th');
  v_otp := r.otp_code;
  v_id  := r.ticket_id;
  RESET ROLE;

  -- Test 6: anon verify with correct OTP succeeds and sets verified_at
  SET LOCAL ROLE anon;
  PERFORM ok(
    (SELECT ok FROM verify_walkin_ticket(v_id, v_otp)),
    'Test 6: correct OTP returns ok=true'
  );
  RESET ROLE;

  PERFORM ok(
    (SELECT verified_at IS NOT NULL FROM queue_tickets WHERE id = v_id),
    'Test 7: verified_at is set after successful verify'
  );

  -- Test 8: re-verify same OTP after success is a no-op success
  SET LOCAL ROLE anon;
  PERFORM ok(
    (SELECT ok FROM verify_walkin_ticket(v_id, v_otp)),
    'Test 8: re-verifying an already-verified ticket is idempotent ok'
  );
  RESET ROLE;
END $$;

-- Test 9: wrong OTP returns ok=false and increments attempts
DO $$
DECLARE r record; v_id uuid; v_attempts smallint;
BEGIN
  SET LOCAL ROLE anon;
  SELECT * INTO r FROM create_walkin_ticket('HA', 'cough', 'mild', '+66890000011', 'th');
  v_id := r.ticket_id;
  PERFORM ok(
    NOT (SELECT ok FROM verify_walkin_ticket(v_id, '000000')),
    'Test 9a: wrong OTP returns ok=false'
  );
  RESET ROLE;

  SELECT otp_attempts INTO v_attempts FROM queue_tickets WHERE id = v_id;
  PERFORM ok(v_attempts = 1, 'Test 9b: otp_attempts incremented on failed verify');
END $$;

-- ── Tests 10-11: cancel_walkin_ticket ──

DO $$
DECLARE r record; v_id uuid; v_token text;
BEGIN
  SET LOCAL ROLE anon;
  SELECT * INTO r FROM create_walkin_ticket('HA', 'cough', 'mild', '+66890000020', 'th');
  v_id := r.ticket_id;
  v_token := r.patient_token;

  -- Test 10: correct token cancels the ticket
  PERFORM ok(
    (SELECT ok FROM cancel_walkin_ticket(v_id, v_token)),
    'Test 10: cancel with correct token succeeds'
  );
  RESET ROLE;

  PERFORM ok(
    (SELECT state = 'cancelled' FROM queue_tickets WHERE id = v_id),
    'Test 11: state is cancelled after successful cancel'
  );
END $$;

-- ── Tests 12-15: call_next_ticket (staff) ──

-- Switch to staff role and call next from INTMED dept
DO $$
DECLARE r record;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"99999999-9999-9999-9999-999999999991","role":"authenticated"}',
    true
  );
  SET LOCAL ROLE authenticated;

  -- Test 12: call_next on a queue with at least one waiting+verified ticket returns it
  -- (verified ticket from Test 6 setup lives in INTMED; first to be called)
  SELECT * INTO r FROM call_next_ticket('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  PERFORM ok(r.ticket_id IS NOT NULL,
    'Test 12: call_next returns the oldest waiting+verified ticket');

  -- Test 13: state transitioned to called
  PERFORM ok(
    (SELECT state = 'called' FROM queue_tickets WHERE id = r.ticket_id),
    'Test 13: state is called after call_next'
  );

  -- Test 14: called_at and called_by populated
  PERFORM ok(
    (SELECT called_at IS NOT NULL
            AND called_by = '99999999-9999-9999-9999-999999999991'
       FROM queue_tickets WHERE id = r.ticket_id),
    'Test 14: called_at and called_by populated by staff RPC'
  );

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- Test 15: call_next on an empty dept returns NULL
DO $$
DECLARE r record;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"99999999-9999-9999-9999-999999999991","role":"authenticated"}',
    true
  );
  SET LOCAL ROLE authenticated;

  SELECT * INTO r FROM call_next_ticket('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  PERFORM ok(r.ticket_id IS NULL,
    'Test 15: call_next on empty dept returns NULL ticket_id');

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- ── Tests 16-18: mark_ticket_done and mark_ticket_no_show ──

DO $$
DECLARE r record; v_id uuid;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"99999999-9999-9999-9999-999999999991","role":"authenticated"}',
    true
  );
  SET LOCAL ROLE authenticated;

  -- Find the ticket that was 'called' in Test 12
  SELECT id INTO v_id FROM queue_tickets
   WHERE state = 'called'
     AND department_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   LIMIT 1;

  PERFORM mark_ticket_done(v_id);

  PERFORM ok(
    (SELECT state = 'done' AND done_at IS NOT NULL
            AND completed_by = '99999999-9999-9999-9999-999999999991'
       FROM queue_tickets WHERE id = v_id),
    'Test 16: mark_ticket_done sets state=done, done_at, completed_by'
  );

  -- Create another verified ticket and call+no_show it
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT * INTO r FROM create_walkin_ticket('HA', 'cough', 'mild', '+66890000030', 'th');
  PERFORM verify_walkin_ticket(r.ticket_id, r.otp_code);
  RESET ROLE;

  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"99999999-9999-9999-9999-999999999991","role":"authenticated"}',
    true
  );
  SET LOCAL ROLE authenticated;
  PERFORM call_next_ticket('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

  PERFORM mark_ticket_no_show(r.ticket_id);

  PERFORM ok(
    (SELECT state = 'no_show' AND no_show_at IS NOT NULL
       FROM queue_tickets WHERE id = r.ticket_id),
    'Test 17: mark_ticket_no_show sets state=no_show and no_show_at'
  );

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- Test 18: queue_ticket_events captured at least one row per RPC
SELECT cmp_ok(
  (SELECT COUNT(*) FROM queue_ticket_events)::int,
  '>=',
  5,
  'Test 18: queue_ticket_events records audit rows for state changes'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2.2: Run the test — expect RED**

Run: `cd /mnt/d/CareMind && npx supabase test db`
Expected: `walkin_queue_rpcs_test.sql .. FAILED` with errors about undefined functions `create_walkin_ticket`, `verify_walkin_ticket`, etc. Other test files still pass.

- [ ] **Step 2.3: Do NOT commit yet**

The RPC tests and the RPC migration land together in Task 3.

---

## Task 3: RPC migration (GREEN)

**Files:**

- Create: `supabase/migrations/00007_walkin_queue_rpcs.sql`

- [ ] **Step 3.1: Write the RPC migration**

Write `supabase/migrations/00007_walkin_queue_rpcs.sql`:

```sql
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

  -- 3. Per-(hospital, dept, day) ticket number
  SELECT COALESCE(MAX(ticket_number), 0) + 1
    INTO v_ticket_number
    FROM queue_tickets
   WHERE hospital_id  = v_hospital_id
     AND department_id = v_department_id
     AND created_at::date = CURRENT_DATE;

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
```

- [ ] **Step 3.2: Apply the migration**

Run: `cd /mnt/d/CareMind && npx supabase db reset`
Expected: every migration through `00007` applies. No errors.

- [ ] **Step 3.3: Run the RPC tests — expect GREEN**

Run: `cd /mnt/d/CareMind && npx supabase test db`
Expected: five test files pass:

- `_smoke_test.sql` — 1 test
- `walkin_queue_schema_test.sql` — 28 tests
- `walkin_queue_rls_test.sql` — 8 tests
- `walkin_queue_otp_test.sql` — 6 tests
- `walkin_queue_rpcs_test.sql` — 18 tests

Final summary line: `Result: PASS`.

- [ ] **Step 3.4: Commit RPC migration + tests together**

```bash
cd /mnt/d/CareMind
git add supabase/migrations/00007_walkin_queue_rpcs.sql \
        supabase/tests/walkin_queue_rpcs_test.sql
git commit -m "feat(db): add walk-in queue RPCs (create/verify/cancel/call/done/no_show)"
```

---

## Task 4: End-to-end M3a verification

No new files. This is the run-from-scratch sanity check.

- [ ] **Step 4.1: Full reset**

Run: `cd /mnt/d/CareMind && npx supabase db reset`
Expected: migrations `00001` → `00007` apply; `seed.sql` runs; output ends with `Finished supabase db reset`.

- [ ] **Step 4.2: All pgTAP green**

Run: `cd /mnt/d/CareMind && npx supabase test db`
Expected: five files, totals: 1 + 28 + 8 + 6 + 18 = 61 assertions, `Result: PASS`.

- [ ] **Step 4.3: Smoke-test an end-to-end happy path manually**

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres <<'SQL'
SET ROLE anon;
SELECT ticket_number, department_code, otp_code, patient_token
  FROM create_walkin_ticket('GHB', 'cough', 'mild', '+66890000999', 'th');
RESET ROLE;
SQL
```

Expected: one row with `ticket_number` ≥ 1, `department_code = 'INTMED'` (per seed), a 6-digit `otp_code`, and a non-empty `patient_token`. No error.

- [ ] **Step 4.4: Push**

```bash
cd /mnt/d/CareMind
git push
```

Expected: pre-push runs type-check (green — nothing TS changed in this slice), push succeeds.

---

## Out-of-scope notes for M3a

- **API route handlers (M3b):** the OTP and patient token returned from `create_walkin_ticket` flow through the API layer; the HTTP response must strip `otp_code` (it goes to SMS, not the client). M3b will add `web/app/api/queue/...` handlers and a Twilio (or Thai aggregator) client.
- **SMS dispatch (M4):** until the SMS dispatcher lives, the API layer can simply log the OTP in dev. M3a is fully testable without SMS because the RPC returns the raw OTP.
- **Background no-show sweep (M4):** the call_next RPC sets `called_at`; a future cron job will scan tickets with `state='called'` older than `department.no_show_seconds` and transition them to `no_show`. Not in M3a.
- **Wait-time math (M5):** `position_in_queue` is computed at create time; live updates and `est_wait_seconds` need either a view or a separate RPC. Not in M3a.
- **TS types (M3b):** the new `otp_code_hash`/`otp_expires_at`/`otp_attempts` columns aren't yet reflected in `shared/src/types/database.ts`. Add them in M3b alongside the API handlers that actually consume them.

---

## Spec coverage check

| Spec section                                                                               | Covered by                                                                                                             |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| §3.1 — `verified_at`, OTP infra                                                            | Task 1 (columns) + Task 3 (verify_walkin_ticket sets it)                                                               |
| §3.3 — state machine transitions (`waiting → called → done`/`no_show`, `→ cancelled`)      | Task 3 RPCs enforce in plpgsql; pgTAP tests in Task 2 cover each transition                                            |
| §4.3 — anonymous-ticket security via signed patient_token (hash stored, raw returned once) | Task 3 `create_walkin_ticket` + `cancel_walkin_ticket`                                                                 |
| §6.1 — `create_walkin_ticket` request/response shape                                       | Task 3 RETURNS TABLE matches `CreateTicketResponse` minus `estimatedWaitSeconds` (NULL until M5) and SMS dispatch (M4) |
| §6.2 — `verify_walkin_ticket`                                                              | Task 3                                                                                                                 |
| §6.3 — `call_next_ticket` side effects                                                     | Task 3: state change + event row; SMS dispatch deferred to M4                                                          |
| §6.4 — mark done/no-show                                                                   | Task 3                                                                                                                 |
| §11 — pgTAP RPC tests                                                                      | Task 2 (18 assertions across all six RPCs)                                                                             |
| §12 — PHI: OTP and patient token both hashed before storage                                | Task 3 (digest(..., 'sha256') everywhere)                                                                              |

PHI retention sweep (§12) still deferred — needs a cron job, which is M4 infra.
