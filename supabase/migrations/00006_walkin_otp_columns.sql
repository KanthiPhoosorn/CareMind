-- Migration 00006: Add OTP columns to queue_tickets and enable pgcrypto
-- Spec: docs/superpowers/specs/2026-05-11-walk-in-queue-design.md §6.1
--
-- These columns hold the OTP that gates ticket verification.
-- otp_code_hash:  SHA-256(otp) - never store the raw OTP
-- otp_expires_at: 10 minutes after create
-- otp_attempts:   incremented on each failed verify; locks out at 3

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE queue_tickets
  ADD COLUMN otp_code_hash  TEXT,
  ADD COLUMN otp_expires_at TIMESTAMPTZ,
  ADD COLUMN otp_attempts   SMALLINT NOT NULL DEFAULT 0;
