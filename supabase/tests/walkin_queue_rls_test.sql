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
