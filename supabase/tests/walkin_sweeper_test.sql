-- Verifies sweep_stale_called_tickets() correctness:
--   1. Tickets stale past dept.no_show_seconds flip to 'no_show'
--   2. Fresh 'called' tickets (within window) stay 'called'
--   3. Tickets in other states (waiting/done) are untouched
--   4. An audit event row is emitted for each swept ticket
BEGIN;
SELECT plan(8);

-- Fixture
INSERT INTO hospitals (id, name, code)
VALUES ('22222222-2222-2222-2222-222222222222', 'Sweeper Test Hospital', 'SWP')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, hospital_id, code, name_th, name_en, no_show_seconds)
VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1',
   '22222222-2222-2222-2222-222222222222',
   'TEST', 'ทดสอบ', 'Test Dept', 60)
ON CONFLICT (id) DO NOTHING;

-- Staff actor for the called_by reference
INSERT INTO profiles (id, email, full_name, role, hospital_id)
VALUES ('33333333-3333-3333-3333-333333333331',
        'sweeper-actor@test.local', 'Sweeper Actor', 'doctor',
        '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- Three tickets: stale-called, fresh-called, waiting
INSERT INTO queue_tickets (id, hospital_id, department_id, ticket_number,
                           phone_e164, symptom_code, severity, state,
                           patient_token_hash, called_at, called_by)
VALUES
  ('ddddddd1-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   'cccccccc-cccc-cccc-cccc-ccccccccccc1',
   101, '+66800000001', 'fever', 'mild', 'called',
   'tok1',
   NOW() - INTERVAL '10 minutes',
   '33333333-3333-3333-3333-333333333331'),
  ('ddddddd1-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222',
   'cccccccc-cccc-cccc-cccc-ccccccccccc1',
   102, '+66800000002', 'fever', 'mild', 'called',
   'tok2',
   NOW() - INTERVAL '10 seconds',
   '33333333-3333-3333-3333-333333333331'),
  ('ddddddd1-0000-0000-0000-000000000003',
   '22222222-2222-2222-2222-222222222222',
   'cccccccc-cccc-cccc-cccc-ccccccccccc1',
   103, '+66800000003', 'fever', 'mild', 'waiting',
   'tok3',
   NULL,
   NULL);

-- Run the sweeper
SELECT is(
  (SELECT sweep_stale_called_tickets()),
  1,
  'sweeper returns count of swept tickets (= 1)'
);

-- Stale-called → no_show
SELECT is(
  (SELECT state FROM queue_tickets
    WHERE id = 'ddddddd1-0000-0000-0000-000000000001'),
  'no_show',
  'stale called ticket flipped to no_show'
);

-- no_show_at populated
SELECT isnt(
  (SELECT no_show_at FROM queue_tickets
    WHERE id = 'ddddddd1-0000-0000-0000-000000000001'),
  NULL,
  'no_show_at timestamp set'
);

-- Fresh-called stays called
SELECT is(
  (SELECT state FROM queue_tickets
    WHERE id = 'ddddddd1-0000-0000-0000-000000000002'),
  'called',
  'fresh called ticket NOT swept'
);

-- Waiting untouched
SELECT is(
  (SELECT state FROM queue_tickets
    WHERE id = 'ddddddd1-0000-0000-0000-000000000003'),
  'waiting',
  'waiting ticket NOT touched by sweeper'
);

-- Audit event emitted
SELECT is(
  (SELECT to_state FROM queue_ticket_events
    WHERE ticket_id = 'ddddddd1-0000-0000-0000-000000000001'
    ORDER BY occurred_at DESC LIMIT 1),
  'no_show',
  'audit event row emitted with to_state=no_show'
);

SELECT is(
  (SELECT from_state FROM queue_ticket_events
    WHERE ticket_id = 'ddddddd1-0000-0000-0000-000000000001'
    ORDER BY occurred_at DESC LIMIT 1),
  'called',
  'audit event from_state=called'
);

-- Idempotent: second call sweeps nothing (already no_show)
SELECT is(
  (SELECT sweep_stale_called_tickets()),
  0,
  'sweeper returns 0 on second run (idempotent)'
);

SELECT * FROM finish();
ROLLBACK;
