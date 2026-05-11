BEGIN;
SELECT plan(28);

-- ── Tables exist ──
SELECT has_table('public', 'departments', 'departments table exists');
SELECT has_table('public', 'routing_rules', 'routing_rules table exists');
SELECT has_table('public', 'queue_tickets', 'queue_tickets table exists');
SELECT has_table('public', 'queue_ticket_events', 'queue_ticket_events table exists');

-- ── departments columns ──
SELECT has_column('public', 'departments', 'hospital_id', 'departments.hospital_id exists');
SELECT has_column('public', 'departments', 'code', 'departments.code exists');
SELECT has_column('public', 'departments', 'no_show_seconds', 'departments.no_show_seconds exists');
SELECT col_default_is(
  'public', 'departments', 'no_show_seconds', '300',
  'departments.no_show_seconds defaults to 300'
);

-- ── routing_rules columns ──
SELECT has_column('public', 'routing_rules', 'symptom_code', 'routing_rules.symptom_code exists');
SELECT has_column('public', 'routing_rules', 'severity', 'routing_rules.severity exists');
SELECT has_column('public', 'routing_rules', 'target_department_id', 'routing_rules.target_department_id exists');
SELECT has_column('public', 'routing_rules', 'priority', 'routing_rules.priority exists');

-- ── queue_tickets columns ──
SELECT has_column('public', 'queue_tickets', 'hospital_id', 'queue_tickets.hospital_id exists');
SELECT has_column('public', 'queue_tickets', 'department_id', 'queue_tickets.department_id exists');
SELECT has_column('public', 'queue_tickets', 'ticket_number', 'queue_tickets.ticket_number exists');
SELECT has_column('public', 'queue_tickets', 'phone_e164', 'queue_tickets.phone_e164 exists');
SELECT has_column('public', 'queue_tickets', 'symptom_code', 'queue_tickets.symptom_code exists');
SELECT has_column('public', 'queue_tickets', 'severity', 'queue_tickets.severity exists');
SELECT has_column('public', 'queue_tickets', 'state', 'queue_tickets.state exists');
SELECT has_column('public', 'queue_tickets', 'patient_token_hash', 'queue_tickets.patient_token_hash exists');
SELECT has_column('public', 'queue_tickets', 'verified_at', 'queue_tickets.verified_at exists');

-- ── queue_tickets CHECK constraints ──
SELECT col_has_check('public', 'queue_tickets', 'state', 'state has a CHECK constraint');
SELECT col_has_check('public', 'queue_tickets', 'severity', 'severity has a CHECK constraint');

-- A row with an invalid state must fail
SELECT throws_ok(
  $$
    INSERT INTO queue_tickets (
      hospital_id, department_id, ticket_number,
      phone_e164, symptom_code, severity, state, patient_token_hash
    ) VALUES (
      gen_random_uuid(), gen_random_uuid(), 1,
      '+66891234567', 'cough', 'mild', 'not_a_state', 'hash'
    )
  $$,
  '23514',
  NULL,
  'invalid state is rejected by CHECK'
);

-- ── Indexes ──
SELECT has_index('public', 'queue_tickets', 'idx_queue_active',
  'partial index for active tickets exists');
SELECT has_index('public', 'queue_tickets', 'idx_queue_tickets_daily_number',
  'daily-number unique index exists');

-- ── Foreign keys ──
SELECT fk_ok('public', 'queue_tickets', 'hospital_id', 'public', 'hospitals', 'id',
  'queue_tickets.hospital_id → hospitals.id');
SELECT fk_ok('public', 'queue_tickets', 'department_id', 'public', 'departments', 'id',
  'queue_tickets.department_id → departments.id');

SELECT * FROM finish();
ROLLBACK;
