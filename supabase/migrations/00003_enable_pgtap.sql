-- Migration 00003: Enable pgTAP for declarative DB tests
-- Used by `npx supabase test db` to run files under supabase/tests/

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
