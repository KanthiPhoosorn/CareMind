# ADR 0001 — Multi-tenant Architecture

**Status:** accepted
**Date:** 2026-05-07

## Context

CareMind targets multiple Thai hospitals from day one. Each hospital must have isolated patient data, staff accounts, and operational context. Cross-hospital data leakage is a **P0** incident (regulatory + ethical exposure under Thai PDPA and HIPAA-equivalent expectations).

The original `00001_initial_schema.sql` migration shipped with single-tenant assumptions: `patients` and `profiles` had no hospital scoping, and RLS read policies were `USING (true)` for any authenticated user.

## Decision

Adopt **shared-database, row-scoped multi-tenancy** with `hospital_id` as the tenant discriminator.

- New table `hospitals (id UUID PK, name TEXT, code TEXT UNIQUE, created_at TIMESTAMPTZ)`
- Add `hospital_id UUID NOT NULL REFERENCES hospitals(id)` to `profiles` and `patients`
- Per-data tables (`doctor_notes`, `medications`, `lab_results`, `nurse_records`, `imaging`) inherit isolation **through the patient FK** — no direct `hospital_id` column needed
- Helper SQL function `current_hospital_id()` returns `(SELECT hospital_id FROM profiles WHERE id = auth.uid())` for RLS reuse
- Replace permissive `USING (true)` policies with `USING (hospital_id = current_hospital_id())` for `patients` / `profiles` and `USING (patient_id IN (SELECT id FROM patients WHERE hospital_id = current_hospital_id()))` for child tables
- Auth signup flow requires hospital selection (or admin invite linking)

## Consequences

**Positive**
- Hospitals scale independently; onboarding a new hospital is a row insert
- Standard Postgres RLS provides defense-in-depth; misconfigured app code still cannot leak across tenants
- Single-database operational simplicity (one Supabase project, one schema)

**Negative**
- All queries pay an extra join cost via the helper function (mitigated by index on `profiles(id)` and `patients(hospital_id)`)
- Future cross-hospital analytics require a privileged service role bypassing RLS

**Follow-up work**
- Migration `00002_multi_tenant.sql` to add the table, columns, function, and revised policies
- Seed script must insert one hospital before any patient
- **CRITICAL** pgTAP test: hospital A user cannot read hospital B records — required before any production deploy
