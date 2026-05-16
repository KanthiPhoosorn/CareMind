-- Migration 00013: line_user_id column for LINE Messaging API delivery
--
-- LINE addresses recipients by a 32-char hex userId (e.g. U1234abc...), not
-- by phone number. This column stores the LINE userId for a ticket so the
-- dispatch code in callNextTicketAction can pick the right delivery channel.
--
-- The patient → LINE userId association flow (hospital LINE OA webhook
-- captures userId on Add Friend, matches to phone) is intentionally NOT in
-- this migration — that's a separate PR. For now line_user_id stays NULL
-- and the dispatcher falls back to the configured SMS provider (or dev log).

ALTER TABLE queue_tickets
  ADD COLUMN line_user_id TEXT;

-- LINE userIds are 33 chars (1 prefix + 32 hex). Hard-validate to catch
-- obvious wiring mistakes early.
ALTER TABLE queue_tickets
  ADD CONSTRAINT queue_tickets_line_user_id_check
    CHECK (line_user_id IS NULL OR line_user_id ~ '^U[0-9a-f]{32}$');

COMMENT ON COLUMN queue_tickets.line_user_id IS
  'LINE userId (U + 32 hex). NULL when no LINE link. Populated by the LINE OA webhook (follow-up PR).';
