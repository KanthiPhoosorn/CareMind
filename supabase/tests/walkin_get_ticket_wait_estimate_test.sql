-- get_ticket_wait_estimate() correctness tests.
-- Covers: token authentication, position recomputation, terminal states.
BEGIN;
SELECT plan(6);

INSERT INTO hospitals (id, name, code)
VALUES ('55555555-5555-5555-5555-555555555555', 'Wait RPC Hospital', 'WRP')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, hospital_id, code, name_th, name_en)
VALUES
  ('ffffffff-ffff-ffff-ffff-fffffffffff1',
   '55555555-5555-5555-5555-555555555555',
   'WRP', 'รอ-ทดสอบ', 'Wait RPC Test')
ON CONFLICT (id) DO NOTHING;

-- Three waiting tickets with same severity (priority 100) so ticket_number
-- decides ordering. Token hashes mirror what create_walkin_ticket would do.
INSERT INTO queue_tickets (id, hospital_id, department_id, ticket_number,
                           phone_e164, symptom_code, severity, priority,
                           state, patient_token_hash, created_at)
VALUES
  ('fffffff1-0000-0000-0000-000000000001',
   '55555555-5555-5555-5555-555555555555',
   'ffffffff-ffff-ffff-ffff-fffffffffff1',
   301, '+66800000301', 'fever', 'mild', 100, 'waiting',
   encode(extensions.digest('tok301', 'sha256'), 'hex'),
   NOW() - INTERVAL '15 minutes'),
  ('fffffff1-0000-0000-0000-000000000002',
   '55555555-5555-5555-5555-555555555555',
   'ffffffff-ffff-ffff-ffff-fffffffffff1',
   302, '+66800000302', 'fever', 'mild', 100, 'waiting',
   encode(extensions.digest('tok302', 'sha256'), 'hex'),
   NOW() - INTERVAL '10 minutes'),
  ('fffffff1-0000-0000-0000-000000000003',
   '55555555-5555-5555-5555-555555555555',
   'ffffffff-ffff-ffff-ffff-fffffffffff1',
   303, '+66800000303', 'fever', 'mild', 100, 'waiting',
   encode(extensions.digest('tok303', 'sha256'), 'hex'),
   NOW() - INTERVAL '5 minutes');

-- 1. First ticket → position 1
SELECT is(
  (SELECT position_in_queue FROM get_ticket_wait_estimate(
    'fffffff1-0000-0000-0000-000000000001'::uuid,
    'tok301'
  )),
  1,
  'first waiting ticket is position 1'
);

-- 2. Second ticket → position 2
SELECT is(
  (SELECT position_in_queue FROM get_ticket_wait_estimate(
    'fffffff1-0000-0000-0000-000000000002'::uuid,
    'tok302'
  )),
  2,
  'second waiting ticket is position 2'
);

-- 3. Third ticket → position 3
SELECT is(
  (SELECT position_in_queue FROM get_ticket_wait_estimate(
    'fffffff1-0000-0000-0000-000000000003'::uuid,
    'tok303'
  )),
  3,
  'third waiting ticket is position 3'
);

-- 4. Bad token → raises exception (use SAVEPOINT so the test can continue)
PREPARE bad_token_call AS
  SELECT * FROM get_ticket_wait_estimate(
    'fffffff1-0000-0000-0000-000000000001'::uuid,
    'wrong-token'
  );
SELECT throws_ok(
  'EXECUTE bad_token_call',
  '42501',
  'ticket_not_found_or_token_mismatch',
  'mismatched patient_token raises 42501'
);

-- 5. Estimate is positive for non-empty queue (uses 8min fallback since no
-- 'done' tickets exist for this dept yet)
SELECT ok(
  (SELECT estimated_wait_minutes FROM get_ticket_wait_estimate(
    'fffffff1-0000-0000-0000-000000000002'::uuid,
    'tok302'
  )) >= 8,
  'estimated_wait_minutes uses cold-start fallback (≥ 8 min)'
);

-- 6. Terminal state returns position 0
UPDATE queue_tickets
   SET state = 'done', done_at = NOW()
 WHERE id = 'fffffff1-0000-0000-0000-000000000001';

SELECT is(
  (SELECT position_in_queue FROM get_ticket_wait_estimate(
    'fffffff1-0000-0000-0000-000000000001'::uuid,
    'tok301'
  )),
  0,
  'terminal-state ticket reports position 0'
);

SELECT * FROM finish();
ROLLBACK;
