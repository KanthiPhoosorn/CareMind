-- Guards migration 00014: the line_link_code column, the link_line_user_id
-- RPC, and the two columns added to get_ticket_wait_estimate.
BEGIN;
SELECT plan(14);

-- ---- column shape -------------------------------------------------------
SELECT has_column('public', 'queue_tickets', 'line_link_code',
  'queue_tickets.line_link_code column exists');
SELECT col_type_is('public', 'queue_tickets', 'line_link_code', 'text',
  'line_link_code is TEXT');
SELECT col_not_null('public', 'queue_tickets', 'line_link_code',
  'line_link_code is NOT NULL');
SELECT col_has_default('public', 'queue_tickets', 'line_link_code',
  'line_link_code has a server-side default');

-- ---- fixtures -----------------------------------------------------------
INSERT INTO hospitals (id, name, code)
  VALUES ('7a000000-0000-0000-0000-000000000000', 'LineLink Hospital', 'LLK')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, hospital_id, code, name_th, name_en)
  VALUES ('7a000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '7a000000-0000-0000-0000-000000000000',
          'GP', 'ทั่วไป', 'General')
  ON CONFLICT (id) DO NOTHING;

-- An active (waiting) ticket. line_link_code is left to its DEFAULT.
INSERT INTO queue_tickets (id, hospital_id, department_id, ticket_number,
                           phone_e164, symptom_code, severity, priority,
                           state, patient_token_hash)
  VALUES ('7a000000-1111-1111-1111-111111111111',
          '7a000000-0000-0000-0000-000000000000',
          '7a000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          1, '+66810000001', 'cough', 'mild', 100, 'waiting',
          encode(extensions.digest('llk-tok-1', 'sha256'), 'hex'));

-- A closed (done) ticket with a known, fixed code.
INSERT INTO queue_tickets (id, hospital_id, department_id, ticket_number,
                           phone_e164, symptom_code, severity, priority,
                           state, patient_token_hash, line_link_code)
  VALUES ('7a000000-2222-2222-2222-222222222222',
          '7a000000-0000-0000-0000-000000000000',
          '7a000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          2, '+66810000002', 'cough', 'mild', 100, 'done',
          encode(extensions.digest('llk-tok-2', 'sha256'), 'hex'),
          'DONE0001');

-- 5. the DEFAULT produced an 8-char uppercase-hex code on the waiting ticket
SELECT ok(
  (SELECT line_link_code ~ '^[0-9A-F]{8}$'
     FROM queue_tickets WHERE id = '7a000000-1111-1111-1111-111111111111'),
  'DEFAULT generates an 8-char uppercase-hex line_link_code'
);

-- 6. link_line_user_id on the active ticket reports reason=linked.
--    (reason uniquely determines ok, so checking reason is sufficient.)
SELECT is(
  (SELECT reason FROM link_line_user_id(
     (SELECT line_link_code FROM queue_tickets
        WHERE id = '7a000000-1111-1111-1111-111111111111'),
     'U00000000000000000000000000000001')),
  'linked',
  'link_line_user_id on an active ticket returns reason=linked'
);

-- 7. ...and it actually wrote line_user_id onto the ticket
SELECT is(
  (SELECT line_user_id FROM queue_tickets
     WHERE id = '7a000000-1111-1111-1111-111111111111'),
  'U00000000000000000000000000000001',
  'link_line_user_id wrote line_user_id onto the ticket'
);

-- 8. link_line_user_id on a closed (done) ticket is rejected
SELECT is(
  (SELECT reason FROM link_line_user_id('DONE0001',
     'U00000000000000000000000000000009')),
  'closed',
  'link_line_user_id on a done ticket returns reason=closed'
);

-- 9. ...and left the closed ticket's line_user_id untouched
SELECT is(
  (SELECT line_user_id FROM queue_tickets
     WHERE id = '7a000000-2222-2222-2222-222222222222'),
  NULL,
  'closed ticket line_user_id is left untouched'
);

-- 10. unknown code
SELECT is(
  (SELECT reason FROM link_line_user_id('ZZZZZZZZ',
     'U00000000000000000000000000000009')),
  'not_found',
  'link_line_user_id with an unknown code returns reason=not_found'
);

-- 11. idempotent: relinking with the same userId
SELECT is(
  (SELECT reason FROM link_line_user_id(
     (SELECT line_link_code FROM queue_tickets
        WHERE id = '7a000000-1111-1111-1111-111111111111'),
     'U00000000000000000000000000000001')),
  'already_linked',
  'relinking with the same userId is idempotent (already_linked)'
);

-- 12. a different userId on an already-linked ticket
SELECT is(
  (SELECT reason FROM link_line_user_id(
     (SELECT line_link_code FROM queue_tickets
        WHERE id = '7a000000-1111-1111-1111-111111111111'),
     'U00000000000000000000000000000002')),
  'taken',
  'a different userId on a linked ticket returns reason=taken'
);

-- 13 + 14. get_ticket_wait_estimate now surfaces the two new columns
SELECT isnt(
  (SELECT line_link_code FROM get_ticket_wait_estimate(
     '7a000000-1111-1111-1111-111111111111'::uuid, 'llk-tok-1')),
  NULL,
  'get_ticket_wait_estimate returns a non-null line_link_code'
);
SELECT is(
  (SELECT line_user_id FROM get_ticket_wait_estimate(
     '7a000000-1111-1111-1111-111111111111'::uuid, 'llk-tok-1')),
  'U00000000000000000000000000000001',
  'get_ticket_wait_estimate returns the linked line_user_id'
);

SELECT * FROM finish();
ROLLBACK;
