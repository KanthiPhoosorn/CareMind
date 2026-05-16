-- Verify the demo staff profile is correctly seeded.
-- The seed inserts both an auth.users row and a matching public.profiles row.
-- This test guards the contract that walk-in queue staff RPCs depend on:
--   current_hospital_id() must return the demo hospital for the demo user.
BEGIN;
SELECT plan(6);

-- A1.1: profile row exists
SELECT ok(
  EXISTS(SELECT 1 FROM profiles WHERE id = '99999999-9999-9999-9999-999999999991'),
  'demo staff profile is seeded'
);

-- A1.2: profile has correct email
SELECT is(
  (SELECT email FROM profiles WHERE id = '99999999-9999-9999-9999-999999999991'),
  'staff@demo.caremind.local',
  'demo staff has expected email'
);

-- A1.3: profile is scoped to the demo hospital
SELECT is(
  (SELECT hospital_id FROM profiles WHERE id = '99999999-9999-9999-9999-999999999991'),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'demo staff hospital_id matches General Hospital Bangkok'
);

-- A1.4: profile role is clinical (so it can call staff RPCs)
SELECT ok(
  (SELECT role FROM profiles WHERE id = '99999999-9999-9999-9999-999999999991') IN ('doctor', 'nurse'),
  'demo staff role is clinical'
);

-- A1.5: matching auth.users row exists (so signInWithPassword works)
SELECT ok(
  EXISTS(SELECT 1 FROM auth.users WHERE id = '99999999-9999-9999-9999-999999999991'),
  'demo staff auth.users row is seeded'
);

-- A1.6: auth.identities row exists (required for password sign-in path)
SELECT ok(
  EXISTS(SELECT 1 FROM auth.identities WHERE user_id = '99999999-9999-9999-9999-999999999991'),
  'demo staff auth.identities row is seeded'
);

SELECT * FROM finish();
ROLLBACK;
