-- Schema-shape tests for sms_dispatch_log. End-to-end SMS round-trip is
-- mocked in vitest at the server-action level — this suite only guards the
-- table contract that the dispatch code depends on.
BEGIN;
SELECT plan(7);

-- Table exists
SELECT has_table('public', 'sms_dispatch_log', 'sms_dispatch_log table exists');

-- Columns
SELECT has_column('public', 'sms_dispatch_log', 'ticket_id', 'ticket_id column exists');
SELECT col_type_is('public', 'sms_dispatch_log', 'ticket_id', 'uuid', 'ticket_id is UUID');
SELECT col_not_null('public', 'sms_dispatch_log', 'ticket_id', 'ticket_id is NOT NULL');

-- Indexes are in place (per-ticket lookup, recent dispatch scan)
SELECT has_index('public', 'sms_dispatch_log', 'idx_sms_dispatch_ticket', 'per-ticket index exists');
SELECT has_index('public', 'sms_dispatch_log', 'idx_sms_dispatch_recent', 'recent-dispatch index exists');

-- FK cascades (ticket deletion drops its dispatch log rows)
SELECT col_is_fk('public', 'sms_dispatch_log', 'ticket_id', 'ticket_id is a foreign key');

SELECT * FROM finish();
ROLLBACK;
