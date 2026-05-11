-- pgTAP tests for OTP columns in queue_tickets table
-- Test that the OTP migration adds the required columns with correct types and defaults

BEGIN;
SELECT plan(6);

-- Test 1: otp_code_hash column exists
SELECT has_column('public', 'queue_tickets', 'otp_code_hash', 'queue_tickets has otp_code_hash column');

-- Test 2: otp_expires_at column exists
SELECT has_column('public', 'queue_tickets', 'otp_expires_at', 'queue_tickets has otp_expires_at column');

-- Test 3: otp_attempts column exists
SELECT has_column('public', 'queue_tickets', 'otp_attempts', 'queue_tickets has otp_attempts column');

-- Test 4: otp_code_hash has type TEXT
SELECT col_type_is('public', 'queue_tickets', 'otp_code_hash', 'text', 'otp_code_hash is type TEXT');

-- Test 5: otp_expires_at has type TIMESTAMPTZ
SELECT col_type_is('public', 'queue_tickets', 'otp_expires_at', 'timestamp with time zone', 'otp_expires_at is type TIMESTAMPTZ');

-- Test 6: otp_attempts has default value 0
SELECT col_default_is('public', 'queue_tickets', 'otp_attempts', '0', 'otp_attempts default value is 0');

SELECT * FROM finish();
ROLLBACK;
