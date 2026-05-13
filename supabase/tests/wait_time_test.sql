-- estimate_wait_minutes() and queue_dept_stats_today view tests.
-- Fixture: 5 completed tickets with known intervals (avg ~6 min) and one
-- waiting ticket; we assert position-based estimates land within tolerance.
BEGIN;
SELECT plan(7);

INSERT INTO hospitals (id, name, code)
VALUES ('44444444-4444-4444-4444-444444444444', 'Wait Stats Hospital', 'WST')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, hospital_id, code, name_th, name_en)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
   '44444444-4444-4444-4444-444444444444',
   'WAIT', 'รอ', 'Wait Test')
ON CONFLICT (id) DO NOTHING;

-- 5 done tickets, each with a known wait (4, 5, 6, 7, 8 min — avg = 6)
INSERT INTO queue_tickets (id, hospital_id, department_id, ticket_number,
                           phone_e164, symptom_code, severity, state,
                           patient_token_hash, created_at, called_at, done_at)
VALUES
  ('eeeeeee1-0000-0000-0000-000000000001',
   '44444444-4444-4444-4444-444444444444',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
   201, '+66800000201', 'fever', 'mild', 'done',
   'tok201',
   NOW() - INTERVAL '60 minutes',
   NOW() - INTERVAL '56 minutes',
   NOW() - INTERVAL '50 minutes'),
  ('eeeeeee1-0000-0000-0000-000000000002',
   '44444444-4444-4444-4444-444444444444',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
   202, '+66800000202', 'fever', 'mild', 'done',
   'tok202',
   NOW() - INTERVAL '50 minutes',
   NOW() - INTERVAL '45 minutes',
   NOW() - INTERVAL '38 minutes'),
  ('eeeeeee1-0000-0000-0000-000000000003',
   '44444444-4444-4444-4444-444444444444',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
   203, '+66800000203', 'fever', 'mild', 'done',
   'tok203',
   NOW() - INTERVAL '40 minutes',
   NOW() - INTERVAL '34 minutes',
   NOW() - INTERVAL '25 minutes'),
  ('eeeeeee1-0000-0000-0000-000000000004',
   '44444444-4444-4444-4444-444444444444',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
   204, '+66800000204', 'fever', 'mild', 'done',
   'tok204',
   NOW() - INTERVAL '30 minutes',
   NOW() - INTERVAL '23 minutes',
   NOW() - INTERVAL '15 minutes'),
  ('eeeeeee1-0000-0000-0000-000000000005',
   '44444444-4444-4444-4444-444444444444',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
   205, '+66800000205', 'fever', 'mild', 'done',
   'tok205',
   NOW() - INTERVAL '20 minutes',
   NOW() - INTERVAL '12 minutes',
   NOW() - INTERVAL '5 minutes'),
  -- one currently waiting ticket so the view's waiting_now > 0
  ('eeeeeee1-0000-0000-0000-000000000006',
   '44444444-4444-4444-4444-444444444444',
   'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
   206, '+66800000206', 'fever', 'mild', 'waiting',
   'tok206',
   NOW() - INTERVAL '5 minutes',
   NULL, NULL);

-- 1. position 0 → 0 minutes
SELECT is(
  estimate_wait_minutes('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 0),
  0,
  'position 0 estimates 0 minutes'
);

-- 2. position 1 ≈ 6 min (avg of 4,5,6,7,8). Allow ±2 for rounding.
SELECT ok(
  ABS(estimate_wait_minutes('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 1) - 6) <= 2,
  'position 1 estimate within 2 minutes of historical avg (~6)'
);

-- 3. position 3 ≈ 18 min (3 × 6). Allow ±5 for rounding.
SELECT ok(
  ABS(estimate_wait_minutes('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', 3) - 18) <= 5,
  'position 3 estimate ~3x position-1 estimate'
);

-- 4. Negative position → 0 (defensive)
SELECT is(
  estimate_wait_minutes('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', -1),
  0,
  'negative position returns 0'
);

-- 5. Unknown department falls back to 8 min/position default
SELECT is(
  estimate_wait_minutes(gen_random_uuid(), 2),
  16,
  'unknown department falls back to 8 min × position'
);

-- 6. View: calls_done_today >= 5 for this dept
SELECT ok(
  (SELECT calls_done_today FROM queue_dept_stats_today
    WHERE department_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1') >= 5,
  'queue_dept_stats_today counts 5+ done tickets'
);

-- 7. View: waiting_now = 1
SELECT is(
  (SELECT waiting_now FROM queue_dept_stats_today
    WHERE department_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1'),
  1::bigint,
  'queue_dept_stats_today reports waiting_now=1'
);

SELECT * FROM finish();
ROLLBACK;
