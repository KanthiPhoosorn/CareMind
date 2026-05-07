-- CareMind Initial Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (linked to Supabase Auth)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('doctor','nurse','pharmacist','patient')),
  staff_id TEXT, department TEXT, avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patients
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admission_number TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL, age INTEGER NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('M','F','Other')),
  ward TEXT NOT NULL, bed TEXT NOT NULL,
  admission_date DATE NOT NULL,
  primary_diagnosis TEXT NOT NULL, attending_doctor TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Admitted' CHECK (status IN ('Admitted','Discharged','Transfer','Critical')),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_patients_an ON patients(admission_number);
CREATE INDEX idx_patients_status ON patients(status);

-- Doctor Notes
CREATE TABLE doctor_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  doctor_id TEXT NOT NULL, doctor_name TEXT NOT NULL, specialty TEXT NOT NULL,
  chief_complaint TEXT NOT NULL, diagnosis TEXT NOT NULL,
  assessment TEXT NOT NULL, plan TEXT NOT NULL,
  vital_signs JSONB NOT NULL DEFAULT '{}', notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_dn_patient ON doctor_notes(patient_id);
CREATE INDEX idx_dn_ts ON doctor_notes(timestamp DESC);

-- Medications
CREATE TABLE medications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL, order_id TEXT NOT NULL,
  medication_name TEXT NOT NULL, dosage TEXT NOT NULL, route TEXT NOT NULL,
  frequency TEXT NOT NULL, duration TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0,
  prescribed_by TEXT NOT NULL, indication TEXT NOT NULL, instructions TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Completed','Discontinued')),
  start_date DATE NOT NULL, end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_med_patient ON medications(patient_id);
CREATE INDEX idx_med_status ON medications(status);

-- Lab Results
CREATE TABLE lab_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL, order_id TEXT NOT NULL,
  test_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Completed','Pending','In Progress')),
  collected_by TEXT NOT NULL, ordered_by TEXT NOT NULL,
  results JSONB, interpretation TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lab_patient ON lab_results(patient_id);

-- Nurse Records
CREATE TABLE nurse_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  nurse_id TEXT NOT NULL, nurse_name TEXT NOT NULL,
  shift TEXT NOT NULL CHECK (shift IN ('Day','Evening','Night')),
  task_type TEXT NOT NULL, vital_signs JSONB, medication TEXT, notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_nr_patient ON nurse_records(patient_id);
CREATE INDEX idx_nr_ts ON nurse_records(timestamp DESC);

-- Imaging
CREATE TABLE imaging (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL, order_id TEXT NOT NULL,
  exam_type TEXT NOT NULL, indication TEXT NOT NULL, technique TEXT DEFAULT '',
  radiologist_id TEXT NOT NULL, radiologist_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Final Report','Preliminary','Pending')),
  findings JSONB NOT NULL DEFAULT '{}', impression TEXT NOT NULL,
  recommendations TEXT DEFAULT '', imaging_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_img_patient ON imaging(patient_id);

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE nurse_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE imaging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_patients" ON patients FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_dn" ON doctor_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_med" ON medications FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_lab" ON lab_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_nr" ON nurse_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_img" ON imaging FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own_update_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
