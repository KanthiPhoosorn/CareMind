-- Migration 00002: Multi-tenant Architecture
-- Implements ADR 0001: Row-scoped multi-tenancy by hospital_id

-- 1. Create hospitals table
CREATE TABLE hospitals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add hospital_id to profiles and patients
ALTER TABLE profiles 
  ADD COLUMN hospital_id UUID REFERENCES hospitals(id) ON DELETE CASCADE;

ALTER TABLE patients 
  ADD COLUMN hospital_id UUID REFERENCES hospitals(id) ON DELETE CASCADE;

-- 3. Create helper function for RLS
CREATE OR REPLACE FUNCTION current_hospital_id()
RETURNS UUID AS $$
  SELECT hospital_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 4. Replace permissive policies with tenant-scoped policies

-- Profiles: Users can only see profiles in their own hospital
DROP POLICY IF EXISTS "auth_read_profiles" ON profiles;
CREATE POLICY "tenant_read_profiles" ON profiles 
  FOR SELECT TO authenticated 
  USING (hospital_id = current_hospital_id());

-- Patients: Users can only see patients in their own hospital
DROP POLICY IF EXISTS "auth_read_patients" ON patients;
CREATE POLICY "tenant_read_patients" ON patients 
  FOR SELECT TO authenticated 
  USING (hospital_id = current_hospital_id());

-- Doctor Notes
DROP POLICY IF EXISTS "auth_read_dn" ON doctor_notes;
CREATE POLICY "tenant_read_dn" ON doctor_notes 
  FOR SELECT TO authenticated 
  USING (patient_id IN (SELECT id FROM patients WHERE hospital_id = current_hospital_id()));

-- Medications
DROP POLICY IF EXISTS "auth_read_med" ON medications;
CREATE POLICY "tenant_read_med" ON medications 
  FOR SELECT TO authenticated 
  USING (patient_id IN (SELECT id FROM patients WHERE hospital_id = current_hospital_id()));

-- Lab Results
DROP POLICY IF EXISTS "auth_read_lab" ON lab_results;
CREATE POLICY "tenant_read_lab" ON lab_results 
  FOR SELECT TO authenticated 
  USING (patient_id IN (SELECT id FROM patients WHERE hospital_id = current_hospital_id()));

-- Nurse Records
DROP POLICY IF EXISTS "auth_read_nr" ON nurse_records;
CREATE POLICY "tenant_read_nr" ON nurse_records 
  FOR SELECT TO authenticated 
  USING (patient_id IN (SELECT id FROM patients WHERE hospital_id = current_hospital_id()));

-- Imaging
DROP POLICY IF EXISTS "auth_read_img" ON imaging;
CREATE POLICY "tenant_read_img" ON imaging 
  FOR SELECT TO authenticated 
  USING (patient_id IN (SELECT id FROM patients WHERE hospital_id = current_hospital_id()));

-- 5. Add indexes for performance
CREATE INDEX idx_profiles_hospital ON profiles(hospital_id);
CREATE INDEX idx_patients_hospital ON patients(hospital_id);
