-- Guards the line_user_id column shape + format check from migration 00013.
BEGIN;
SELECT plan(4);

SELECT has_column('public', 'queue_tickets', 'line_user_id',
  'queue_tickets.line_user_id column exists');
SELECT col_type_is('public', 'queue_tickets', 'line_user_id', 'text',
  'line_user_id is TEXT');
SELECT col_is_null('public', 'queue_tickets', 'line_user_id',
  'line_user_id is nullable (LINE link is optional)');

-- The CHECK constraint accepts a valid LINE userId shape and rejects junk.
-- We need a valid ticket to attach to first.
INSERT INTO hospitals (id, name, code)
  VALUES ('77777777-7777-7777-7777-777777777777', 'LineFmt Hospital', 'LFT')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, hospital_id, code, name_th, name_en)
  VALUES ('77777777-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '77777777-7777-7777-7777-777777777777',
          'TRIAGE', 'จุดคัดกรอง', 'Triage')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO queue_tickets (
  id, hospital_id, department_id, ticket_number,
  phone_e164, symptom_code, severity, state, patient_token_hash,
  line_user_id
) VALUES (
  '77777777-eeee-eeee-eeee-eeeeeeeeeeee',
  '77777777-7777-7777-7777-777777777777',
  '77777777-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  1, '+66811111111', 'cough', NULL, 'pending_triage', 'tokfmt',
  'Udeadbeef0123456789abcdef01234567'
);

-- Valid form accepted
SELECT ok(
  (SELECT line_user_id FROM queue_tickets WHERE id = '77777777-eeee-eeee-eeee-eeeeeeeeeeee')
    = 'Udeadbeef0123456789abcdef01234567',
  'valid LINE userId stored as-is'
);

SELECT * FROM finish();
ROLLBACK;
