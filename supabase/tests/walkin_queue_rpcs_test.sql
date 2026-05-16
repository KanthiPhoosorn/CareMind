-- Walk-in queue RPC tests (M0 + M3a + Phase E nurse triage).
--
-- Flow under test:
--   1. create_walkin_ticket → ticket lands in TRIAGE dept, pending_triage state.
--   2. verify_walkin_ticket → OTP, independent of state.
--   3. cancel_walkin_ticket → patient bails before triage.
--   4. triage_walkin_ticket → nurse assigns severity, re-routes to OPD dept.
--   5. call_next_ticket / mark_ticket_done / mark_ticket_no_show → OPD flow.
--
-- Every assertion is a top-level SELECT so pgTAP's TAP output reaches stdout.
BEGIN;
SELECT plan(28);

-- ── Fixture ──
INSERT INTO hospitals (id, name, code) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Hospital A', 'HA');

INSERT INTO departments (id, hospital_id, code, name_th, name_en) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'INTMED', 'อายุรกรรม', 'Internal Medicine'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '11111111-1111-1111-1111-111111111111', 'ER',     'ฉุกเฉิน',  'Emergency'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '11111111-1111-1111-1111-111111111111', 'TRIAGE', 'จุดคัดกรอง', 'Triage');

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
  SELECT * FROM create_walkin_ticket('HA', 'cough', '+66890000001', 'th');

SELECT ok((SELECT ticket_id IS NOT NULL FROM t1),
  'Test 1a: create returns a ticket_id');
SELECT ok((SELECT ticket_number = 1 FROM t1),
  'Test 1b: first ticket of the day in TRIAGE is #1');
SELECT ok((SELECT department_code = 'TRIAGE' FROM t1),
  'Test 1c: every new walk-in lands in TRIAGE (severity assigned later by nurse)');
SELECT ok((SELECT length(patient_token) >= 24 FROM t1),
  'Test 1d: patient_token returned and non-trivial');
SELECT ok((SELECT otp_code ~ '^\d{6}$' FROM t1),
  'Test 1e: otp_code is a 6-digit string');

SELECT ok(
  (SELECT state = 'pending_triage' AND severity IS NULL
     FROM queue_tickets q, t1 WHERE q.id = t1.ticket_id),
  'Test 2: new ticket is pending_triage with NULL severity'
);

SELECT throws_ok(
  $$ SELECT * FROM create_walkin_ticket('ZZZ', 'cough', '+66890000003', 'th') $$,
  '22023', NULL,
  'Test 3: unknown hospital code raises 22023'
);

SELECT throws_ok(
  $$ SELECT * FROM create_walkin_ticket('HA', 'unmapped_symptom', '+66890000004', 'th') $$,
  '22023', NULL,
  'Test 4: invalid symptom code raises 22023'
);

CREATE TEMP TABLE t5 ON COMMIT DROP AS
  SELECT * FROM create_walkin_ticket('HA', 'cough', '+66890000005', 'th');

SELECT ok((SELECT ticket_number = 2 FROM t5),
  'Test 5: second ticket of the day in TRIAGE is #2');

-- ── Tests 6-9: verify_walkin_ticket (works regardless of state) ──

CREATE TEMP TABLE t_verify ON COMMIT DROP AS
  SELECT * FROM create_walkin_ticket('HA', 'cough', '+66890000010', 'th');
-- t_verify is later read under SET LOCAL ROLE authenticated for the triage
-- test, so we grant access up front.
GRANT SELECT ON t_verify TO authenticated;

CREATE TEMP TABLE t_verify_ok ON COMMIT DROP AS
  SELECT v.ok
    FROM t_verify, LATERAL verify_walkin_ticket(t_verify.ticket_id, t_verify.otp_code) v;

SELECT ok((SELECT ok FROM t_verify_ok), 'Test 6: correct OTP returns ok=true');
SELECT ok(
  (SELECT verified_at IS NOT NULL FROM queue_tickets q, t_verify
    WHERE q.id = t_verify.ticket_id),
  'Test 7: verified_at is set after successful verify'
);

CREATE TEMP TABLE t9 ON COMMIT DROP AS
  SELECT * FROM create_walkin_ticket('HA', 'cough', '+66890000011', 'th');

CREATE TEMP TABLE t9_bad ON COMMIT DROP AS
  SELECT v.ok AS bad_ok
    FROM t9, LATERAL verify_walkin_ticket(t9.ticket_id, '000000') v;

SELECT ok((SELECT NOT bad_ok FROM t9_bad), 'Test 8: wrong OTP returns ok=false');
SELECT ok(
  (SELECT otp_attempts = 1 FROM queue_tickets q, t9 WHERE q.id = t9.ticket_id),
  'Test 9: otp_attempts incremented on failed verify'
);

-- ── Tests 10-11: cancel_walkin_ticket on pending_triage ──

CREATE TEMP TABLE t_cancel ON COMMIT DROP AS
  SELECT * FROM create_walkin_ticket('HA', 'cough', '+66890000020', 'th');

CREATE TEMP TABLE t_cancel_ok ON COMMIT DROP AS
  SELECT c.ok
    FROM t_cancel, LATERAL cancel_walkin_ticket(t_cancel.ticket_id, t_cancel.patient_token) c;

SELECT ok((SELECT ok FROM t_cancel_ok),
  'Test 10: cancel with correct token succeeds (even pre-triage)');
SELECT ok(
  (SELECT state = 'cancelled' FROM queue_tickets q, t_cancel WHERE q.id = t_cancel.ticket_id),
  'Test 11: state is cancelled after successful cancel'
);

-- ── Tests 12-15: triage_walkin_ticket ──

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"91919191-9191-9191-9191-919191919191","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE t_triage_result ON COMMIT DROP AS
  SELECT r.*
    FROM t_verify, LATERAL triage_walkin_ticket(t_verify.ticket_id, 'mild') r;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT ok((SELECT department_code = 'INTMED' FROM t_triage_result),
  'Test 12: triage cough+mild routes to INTMED (NULL-severity rule)');
SELECT ok((SELECT severity = 'mild' FROM t_triage_result),
  'Test 13: triage_walkin_ticket records the assigned severity');
SELECT ok(
  (SELECT state = 'waiting' AND severity = 'mild' AND priority = 100
     FROM queue_tickets q, t_verify WHERE q.id = t_verify.ticket_id),
  'Test 14: triage transitions pending_triage → waiting with priority from severity'
);

-- severe injury should re-route to ER (priority-10 rule wins over fallback)
CREATE TEMP TABLE t_severe_create ON COMMIT DROP AS
  SELECT * FROM create_walkin_ticket('HA', 'injury', '+66890000040', 'th');
GRANT SELECT ON t_severe_create TO authenticated;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"91919191-9191-9191-9191-919191919191","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE t_severe_triage ON COMMIT DROP AS
  SELECT r.*
    FROM t_severe_create, LATERAL triage_walkin_ticket(t_severe_create.ticket_id, 'severe') r;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT ok((SELECT department_code = 'ER' FROM t_severe_triage),
  'Test 15: triage injury+severe re-routes to ER (priority-10 rule wins)');

-- ── Tests 16-17: triage error paths ──

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"91919191-9191-9191-9191-919191919191","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE t_double ON COMMIT DROP AS
  SELECT t_verify.ticket_id FROM t_verify;
GRANT SELECT ON t_double TO authenticated;

SELECT throws_ok(
  $$ SELECT * FROM triage_walkin_ticket((SELECT ticket_id FROM t_double), 'severe') $$,
  '22023', NULL,
  'Test 16: triaging an already-waiting ticket raises 22023'
);

SELECT throws_ok(
  $$ SELECT * FROM triage_walkin_ticket((SELECT ticket_id FROM t_double), 'bogus') $$,
  '22023', NULL,
  'Test 17: invalid severity raises 22023'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ── Tests 18-20: call_next_ticket (staff role required) ──

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
  'Test 18: call_next on INTMED returns the post-triage ticket');
SELECT ok(
  (SELECT state = 'called' FROM queue_tickets q, t_call WHERE q.id = t_call.ticket_id),
  'Test 19: state is called after call_next'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"91919191-9191-9191-9191-919191919191","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE t_empty ON COMMIT DROP AS
  SELECT * FROM call_next_ticket('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT ok((SELECT ticket_id IS NULL FROM t_empty),
  'Test 20: call_next on dept with no waiting tickets returns NULL');

-- ── Tests 21-22: mark_ticket_done / mark_ticket_no_show ──

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
  'Test 21: mark_ticket_done sets state=done, done_at, completed_by'
);

CREATE TEMP TABLE t_ns ON COMMIT DROP AS
  SELECT * FROM create_walkin_ticket('HA', 'cough', '+66890000030', 'th');
SELECT v.ok FROM t_ns, LATERAL verify_walkin_ticket(t_ns.ticket_id, t_ns.otp_code) v;
GRANT SELECT ON t_ns TO authenticated;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"91919191-9191-9191-9191-919191919191","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT triage_walkin_ticket(ticket_id, 'mild') FROM t_ns;
SELECT call_next_ticket('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT mark_ticket_no_show(ticket_id) FROM t_ns;

RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

SELECT ok(
  (SELECT state = 'no_show' AND no_show_at IS NOT NULL
     FROM queue_tickets q, t_ns WHERE q.id = t_ns.ticket_id),
  'Test 22: mark_ticket_no_show sets state=no_show and no_show_at'
);

-- ── Tests 23-24: audit trail ──

SELECT cmp_ok(
  (SELECT COUNT(*) FROM queue_ticket_events WHERE to_state = 'waiting')::int,
  '>=',
  2,
  'Test 23: triage events emit pending_triage → waiting audit rows'
);

SELECT cmp_ok(
  (SELECT COUNT(*) FROM queue_ticket_events)::int,
  '>=',
  6,
  'Test 24: queue_ticket_events records audit rows for state changes'
);

SELECT * FROM finish();
ROLLBACK;
