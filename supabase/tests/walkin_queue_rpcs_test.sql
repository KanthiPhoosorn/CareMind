-- Walk-in queue RPC tests (M0 + M3a).
--
-- Style notes:
--   1. Every assertion is a top-level SELECT so pgTAP's ok()/throws_ok()
--      output reaches psql stdout. PERFORM inside DO blocks accumulates
--      into pgTAP's counter but doesn't emit to stdout, leaving finish()
--      empty and tripping pg_prove with "Bad plan ... ran 0".
--   2. We don't SET LOCAL ROLE anon for the SECURITY DEFINER RPCs
--      (create_walkin_ticket / verify_walkin_ticket / cancel_walkin_ticket).
--      The grants-to-anon are exercised separately by walkin_queue_rls_test.
--      Avoiding the switch keeps temp tables owned by the session user so
--      both anon-style assertions and the staff RPC calls can read them.
BEGIN;
SELECT plan(23);

-- ── Fixture: one hospital, two depts, routing rules, one staff profile ──
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

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) VALUES (
  '91919191-9191-9191-9191-919191919191',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'staff-a@example.test', '',
  NOW(), NOW(), NOW(), '{}'::jsonb, '{}'::jsonb
);

INSERT INTO profiles (id, hospital_id, email, full_name, role)
  VALUES ('91919191-9191-9191-9191-919191919191',
          '11111111-1111-1111-1111-111111111111',
          'staff-a@example.test', 'Staff A', 'doctor');

-- ── Tests 1-5: create_walkin_ticket ──

CREATE TEMP TABLE t1 ON COMMIT DROP AS
  SELECT * FROM create_walkin_ticket('HA', 'cough', 'mild', '+66890000001', 'th');

SELECT ok((SELECT ticket_id IS NOT NULL FROM t1), 'Test 1a: create returns a ticket_id');
SELECT ok((SELECT ticket_number = 1 FROM t1), 'Test 1b: first ticket of the day is #1');
SELECT ok((SELECT department_code = 'INTMED' FROM t1), 'Test 1c: cough/mild routes to INTMED');
SELECT ok((SELECT length(patient_token) >= 24 FROM t1), 'Test 1d: patient_token returned and non-trivial');
SELECT ok((SELECT otp_code ~ '^\d{6}$' FROM t1), 'Test 1e: otp_code is a 6-digit string');

CREATE TEMP TABLE t2 ON COMMIT DROP AS
  SELECT * FROM create_walkin_ticket('HA', 'injury', 'severe', '+66890000002', 'th');

SELECT ok((SELECT department_code = 'ER' FROM t2),
  'Test 2: injury+severe routes to ER (priority 10 wins over fallback)');

SELECT throws_ok(
  $$ SELECT * FROM create_walkin_ticket('ZZZ', 'cough', 'mild', '+66890000003', 'th') $$,
  '22023', NULL,
  'Test 3: unknown hospital code raises 22023'
);
SELECT throws_ok(
  $$ SELECT * FROM create_walkin_ticket('HA', 'unmapped_symptom', 'mild', '+66890000004', 'th') $$,
  '22023', NULL,
  'Test 4: missing routing rule raises 22023'
);

CREATE TEMP TABLE t5 ON COMMIT DROP AS
  SELECT * FROM create_walkin_ticket('HA', 'cough', 'mild', '+66890000005', 'th');

SELECT ok((SELECT ticket_number = 2 FROM t5),
  'Test 5: second ticket of the day is #2');

-- ── Tests 6-9: verify_walkin_ticket ──

CREATE TEMP TABLE t_verify ON COMMIT DROP AS
  SELECT * FROM create_walkin_ticket('HA', 'cough', 'mild', '+66890000010', 'th');

CREATE TEMP TABLE t_verify_ok ON COMMIT DROP AS
  SELECT v.ok
    FROM t_verify, LATERAL verify_walkin_ticket(t_verify.ticket_id, t_verify.otp_code) v;

SELECT ok((SELECT ok FROM t_verify_ok), 'Test 6: correct OTP returns ok=true');
SELECT ok(
  (SELECT verified_at IS NOT NULL FROM queue_tickets q, t_verify
    WHERE q.id = t_verify.ticket_id),
  'Test 7: verified_at is set after successful verify'
);

CREATE TEMP TABLE t_reverify_ok ON COMMIT DROP AS
  SELECT v.ok
    FROM t_verify, LATERAL verify_walkin_ticket(t_verify.ticket_id, t_verify.otp_code) v;

SELECT ok((SELECT ok FROM t_reverify_ok),
  'Test 8: re-verifying an already-verified ticket is idempotent ok');

CREATE TEMP TABLE t9 ON COMMIT DROP AS
  SELECT * FROM create_walkin_ticket('HA', 'cough', 'mild', '+66890000011', 'th');

CREATE TEMP TABLE t9_bad ON COMMIT DROP AS
  SELECT v.ok AS bad_ok
    FROM t9, LATERAL verify_walkin_ticket(t9.ticket_id, '000000') v;

SELECT ok((SELECT NOT bad_ok FROM t9_bad), 'Test 9a: wrong OTP returns ok=false');
SELECT ok(
  (SELECT otp_attempts = 1 FROM queue_tickets q, t9 WHERE q.id = t9.ticket_id),
  'Test 9b: otp_attempts incremented on failed verify'
);

-- ── Tests 10-11: cancel_walkin_ticket ──

CREATE TEMP TABLE t_cancel ON COMMIT DROP AS
  SELECT * FROM create_walkin_ticket('HA', 'cough', 'mild', '+66890000020', 'th');

CREATE TEMP TABLE t_cancel_ok ON COMMIT DROP AS
  SELECT c.ok
    FROM t_cancel, LATERAL cancel_walkin_ticket(t_cancel.ticket_id, t_cancel.patient_token) c;

SELECT ok((SELECT ok FROM t_cancel_ok), 'Test 10: cancel with correct token succeeds');
SELECT ok(
  (SELECT state = 'cancelled' FROM queue_tickets q, t_cancel WHERE q.id = t_cancel.ticket_id),
  'Test 11: state is cancelled after successful cancel'
);

-- ── Tests 12-15: call_next_ticket (staff role required for current_hospital_id) ──

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"91919191-9191-9191-9191-919191919191","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE t_call ON COMMIT DROP AS
  SELECT * FROM call_next_ticket('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT ok((SELECT ticket_id IS NOT NULL FROM t_call),
  'Test 12: call_next returns the oldest waiting+verified ticket');
SELECT ok(
  (SELECT state = 'called' FROM queue_tickets q, t_call WHERE q.id = t_call.ticket_id),
  'Test 13: state is called after call_next'
);
SELECT ok(
  (SELECT called_at IS NOT NULL
            AND called_by = '91919191-9191-9191-9191-919191919191'
     FROM queue_tickets q, t_call WHERE q.id = t_call.ticket_id),
  'Test 14: called_at and called_by populated by staff RPC'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"91919191-9191-9191-9191-919191919191","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE t_empty ON COMMIT DROP AS
  SELECT * FROM call_next_ticket('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT ok((SELECT ticket_id IS NULL FROM t_empty),
  'Test 15: call_next on empty dept returns NULL ticket_id');

-- ── Tests 16-17: mark_ticket_done and mark_ticket_no_show ──

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"91919191-9191-9191-9191-919191919191","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE t_done_id ON COMMIT DROP AS
  SELECT id FROM queue_tickets
   WHERE state = 'called'
     AND department_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   LIMIT 1;

SELECT mark_ticket_done(id) FROM t_done_id;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT ok(
  (SELECT state = 'done' AND done_at IS NOT NULL
            AND completed_by = '91919191-9191-9191-9191-919191919191'
     FROM queue_tickets q, t_done_id WHERE q.id = t_done_id.id),
  'Test 16: mark_ticket_done sets state=done, done_at, completed_by'
);

-- Create + verify another ticket, then call it and mark no_show.
-- GRANT SELECT before switching to authenticated because temp tables aren't
-- world-readable by default and we cross role boundaries below.
CREATE TEMP TABLE t_ns ON COMMIT DROP AS
  SELECT * FROM create_walkin_ticket('HA', 'cough', 'mild', '+66890000030', 'th');
SELECT v.ok FROM t_ns, LATERAL verify_walkin_ticket(t_ns.ticket_id, t_ns.otp_code) v;
GRANT SELECT ON t_ns TO authenticated;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"91919191-9191-9191-9191-919191919191","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT call_next_ticket('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT mark_ticket_no_show(ticket_id) FROM t_ns;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT ok(
  (SELECT state = 'no_show' AND no_show_at IS NOT NULL
     FROM queue_tickets q, t_ns WHERE q.id = t_ns.ticket_id),
  'Test 17: mark_ticket_no_show sets state=no_show and no_show_at'
);

-- Test 18: queue_ticket_events captured at least one row per RPC
SELECT cmp_ok(
  (SELECT COUNT(*) FROM queue_ticket_events)::int,
  '>=',
  5,
  'Test 18: queue_ticket_events records audit rows for state changes'
);

SELECT * FROM finish();
ROLLBACK;
