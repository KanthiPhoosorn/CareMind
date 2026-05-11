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
