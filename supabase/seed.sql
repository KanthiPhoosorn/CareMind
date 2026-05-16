-- CareMind Seed Data (Auto-generated)

-- Hospitals
INSERT INTO hospitals (id, name, code) VALUES 
('00000000-0000-0000-0000-000000000001', 'General Hospital Bangkok', 'GHB') ON CONFLICT DO NOTHING;

-- Profiles (Dummy auth user should be created via UI, but here is a profile)
-- Patients
INSERT INTO patients (id, hospital_id, admission_number, name, age, gender, ward, bed, admission_date, primary_diagnosis, attending_doctor, status) VALUES 
('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'an1', 'John Doe', 45, 'M', 'Ward A', 'Bed 1', '2026-02-10', 'Pneumonia', 'Dr. Sarah Johnson', 'Admitted'),
('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'an2', 'Jane Smith', 62, 'F', 'Ward B', 'Bed 12', '2026-02-12', 'Atrial fibrillation', 'Dr. Michael Chen', 'Admitted'),
('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'an3', 'Bob Wilson', 35, 'M', 'Ward C', 'Bed 5', '2026-02-13', 'Gastroenteritis', 'Dr. Emily Rodriguez', 'Admitted')
ON CONFLICT DO NOTHING;

-- Doctor Notes
INSERT INTO doctor_notes (patient_id, timestamp, doctor_id, doctor_name, specialty, chief_complaint, diagnosis, assessment, plan, vital_signs, notes) VALUES 
('00000000-0000-0000-0000-000000000011', '2026-02-14T09:30:00Z', 'DR001', 'Dr. Sarah Johnson', 'Internal Medicine', 'Persistent cough and shortness of breath', 'Acute bronchitis with possible pneumonia', 'Patient presents with productive cough, fever (101.5°F), and decreased breath sounds in right lower lobe. CXR shows infiltrate consistent with pneumonia.', 'Prescribe Azithromycin 500mg PO x5 days. Order chest X-ray and CBC. Follow-up in 3 days if symptoms persist.', '{"temperature":101.5,"bloodPressure":"130/85","heartRate":88,"respiratoryRate":22,"oxygenSaturation":94}', 'Patient is a smoker (10 pack-years). Advised smoking cessation. Will monitor closely for respiratory distress.'),
('00000000-0000-0000-0000-000000000011', '2026-02-15T14:00:00Z', 'DR001', 'Dr. Sarah Johnson', 'Internal Medicine', 'Follow-up visit', 'Acute bronchitis - improving', 'Patient reports decreased cough and improved breathing. Temperature normalized. Chest sounds improved.', 'Continue current antibiotics. Return if symptoms worsen.', '{"temperature":98.6,"bloodPressure":"125/80","heartRate":76,"respiratoryRate":18,"oxygenSaturation":97}', 'Good response to treatment. Continue monitoring.'),
('00000000-0000-0000-0000-000000000012', '2026-02-14T10:45:00Z', 'DR003', 'Dr. Michael Chen', 'Cardiology', 'Chest pain and palpitations', 'Atrial fibrillation - new onset', 'ECG shows irregular rhythm consistent with AFib. Heart rate 110-120 bpm. No signs of acute MI.', 'Start metoprolol 25mg BID. Order echo and electrolytes. Refer to cardiology for anticoagulation consult.', '{"temperature":98.4,"bloodPressure":"145/92","heartRate":118,"respiratoryRate":16,"oxygenSaturation":98}', 'Patient has history of hypertension. Will need long-term anticoagulation management.'),
('00000000-0000-0000-0000-000000000012', '2026-02-15T09:15:00Z', 'DR003', 'Dr. Michael Chen', 'Cardiology', 'Follow-up AFib', 'Atrial fibrillation - rate controlled', 'Heart rate improved to 70-80 bpm on metoprolol. Patient tolerating medication well.', 'Increase metoprolol to 50mg BID. Start apixaban 5mg BID for anticoagulation. Echo scheduled for next week.', '{"temperature":98.6,"bloodPressure":"132/85","heartRate":75,"respiratoryRate":14,"oxygenSaturation":99}', 'Good rate control achieved. Anticoagulation initiated.'),
('00000000-0000-0000-0000-000000000013', '2026-02-13T15:30:00Z', 'DR002', 'Dr. Emily Rodriguez', 'Family Medicine', 'Abdominal pain and nausea', 'Acute gastroenteritis', 'Patient with 2-day history of watery diarrhea, cramping, and vomiting. Mild dehydration noted.', 'Oral rehydration, clear liquid diet. Prescribe ondansetron PRN for nausea. Return if symptoms worsen.', '{"temperature":99.1,"bloodPressure":"118/75","heartRate":82,"respiratoryRate":16,"oxygenSaturation":98}', 'Likely viral gastroenteritis. No antibiotic needed at this time.') ON CONFLICT DO NOTHING;

-- Medications
INSERT INTO medications (patient_id, timestamp, order_id, medication_name, dosage, route, frequency, duration, quantity, prescribed_by, indication, instructions, status, start_date, end_date) VALUES 
('00000000-0000-0000-0000-000000000011', '2026-02-14T09:35:00Z', 'RX-2024-001', 'Azithromycin', '500mg', 'Oral', 'Once daily', '5 days', '5', 'Dr. Sarah Johnson', 'Acute bronchitis', 'Take with food. Complete full course even if symptoms improve.', 'Active', '2026-02-14', '2026-02-18'),
('00000000-0000-0000-0000-000000000011', '2026-02-14T09:35:00Z', 'RX-2024-002', 'Guaifenesin', '400mg', 'Oral', 'Every 4 hours as needed', '7 days', '30', 'Dr. Sarah Johnson', 'Cough with mucus', 'Take with full glass of water. May cause drowsiness.', 'Active', '2026-02-14', '2026-02-21'),
('00000000-0000-0000-0000-000000000012', '2026-02-14T10:50:00Z', 'RX-2024-003', 'Metoprolol', '25mg', 'Oral', 'Twice daily', 'Ongoing', '60', 'Dr. Michael Chen', 'Atrial fibrillation - rate control', 'Take with or without food. Do not stop abruptly. Monitor heart rate.', 'Active', '2026-02-14', NULL),
('00000000-0000-0000-0000-000000000012', '2026-02-15T09:20:00Z', 'RX-2024-004', 'Apixaban', '5mg', 'Oral', 'Twice daily', 'Ongoing', '60', 'Dr. Michael Chen', 'Atrial fibrillation - anticoagulation', 'Take at same times daily. Avoid NSAIDs. Report any bleeding.', 'Active', '2026-02-15', NULL),
('00000000-0000-0000-0000-000000000012', '2026-02-15T09:20:00Z', 'RX-2024-005', 'Metoprolol', '50mg', 'Oral', 'Twice daily', 'Ongoing', '60', 'Dr. Michael Chen', 'Atrial fibrillation - rate control', 'Dose increased from 25mg. Take with or without food.', 'Active', '2026-02-15', NULL),
('00000000-0000-0000-0000-000000000013', '2026-02-13T15:35:00Z', 'RX-2024-006', 'Ondansetron', '4mg', 'Oral disintegrating tablet', 'Every 8 hours as needed', '5 days', '12', 'Dr. Emily Rodriguez', 'Nausea and vomiting', 'Place on tongue, allow to dissolve. No water needed.', 'Active', '2026-02-13', '2026-02-18'),
('00000000-0000-0000-0000-000000000011', '2026-02-12T08:00:00Z', 'RX-2024-007', 'Lisinopril', '10mg', 'Oral', 'Once daily', 'Ongoing', '90', 'Dr. Sarah Johnson', 'Hypertension', 'Take in morning. Monitor blood pressure regularly.', 'Active', '2025-11-01', NULL) ON CONFLICT DO NOTHING;

-- Lab Results
INSERT INTO lab_results (patient_id, timestamp, order_id, test_name, status, collected_by, ordered_by, results, interpretation) VALUES 
('00000000-0000-0000-0000-000000000011', '2026-02-14T10:00:00Z', 'LAB-2024-001', 'Complete Blood Count (CBC)', 'Completed', 'Nurse Maria Santos', 'Dr. Sarah Johnson', '{"WBC":{"value":12.5,"unit":"10^3/μL","range":"4.5-11.0","flag":"High"},"RBC":{"value":4.8,"unit":"10^6/μL","range":"4.5-5.5","flag":"Normal"},"Hemoglobin":{"value":14.2,"unit":"g/dL","range":"13.5-17.5","flag":"Normal"},"Hematocrit":{"value":42.1,"unit":"%","range":"38-50","flag":"Normal"},"Platelets":{"value":245,"unit":"10^3/μL","range":"150-400","flag":"Normal"}}', 'Elevated WBC consistent with bacterial infection'),
('00000000-0000-0000-0000-000000000011', '2026-02-14T10:30:00Z', 'LAB-2024-002', 'Basic Metabolic Panel (BMP)', 'Completed', 'Nurse Maria Santos', 'Dr. Sarah Johnson', '{"Sodium":{"value":140,"unit":"mEq/L","range":"136-145","flag":"Normal"},"Potassium":{"value":4.2,"unit":"mEq/L","range":"3.5-5.0","flag":"Normal"},"Chloride":{"value":102,"unit":"mEq/L","range":"98-107","flag":"Normal"},"CO2":{"value":24,"unit":"mEq/L","range":"23-29","flag":"Normal"},"BUN":{"value":18,"unit":"mg/dL","range":"7-20","flag":"Normal"},"Creatinine":{"value":1,"unit":"mg/dL","range":"0.7-1.3","flag":"Normal"},"Glucose":{"value":95,"unit":"mg/dL","range":"70-100","flag":"Normal"}}', 'All values within normal limits'),
('00000000-0000-0000-0000-000000000012', '2026-02-14T11:15:00Z', 'LAB-2024-003', 'Cardiac Enzymes', 'Completed', 'Nurse John Williams', 'Dr. Michael Chen', '{"Troponin I":{"value":0.02,"unit":"ng/mL","range":"<0.04","flag":"Normal"},"CK-MB":{"value":2.1,"unit":"ng/mL","range":"<5.0","flag":"Normal"},"BNP":{"value":180,"unit":"pg/mL","range":"<100","flag":"Elevated"}}', 'No evidence of acute MI. Elevated BNP suggests cardiac strain.'),
('00000000-0000-0000-0000-000000000012', '2026-02-14T11:15:00Z', 'LAB-2024-004', 'Coagulation Panel', 'Completed', 'Nurse John Williams', 'Dr. Michael Chen', '{"PT":{"value":12.5,"unit":"seconds","range":"11.0-13.5","flag":"Normal"},"INR":{"value":1,"unit":"","range":"0.9-1.1","flag":"Normal"},"aPTT":{"value":28,"unit":"seconds","range":"25-35","flag":"Normal"}}', 'Normal coagulation profile. Safe to start anticoagulation.'),
('00000000-0000-0000-0000-000000000012', '2026-02-15T08:00:00Z', 'LAB-2024-005', 'Thyroid Function Tests', 'Completed', 'Nurse John Williams', 'Dr. Michael Chen', '{"TSH":{"value":2.8,"unit":"μIU/mL","range":"0.4-4.0","flag":"Normal"},"Free T4":{"value":1.2,"unit":"ng/dL","range":"0.8-1.8","flag":"Normal"}}', 'Normal thyroid function. AFib not related to thyroid disorder.'),
('00000000-0000-0000-0000-000000000013', '2026-02-13T16:00:00Z', 'LAB-2024-006', 'Stool Culture', 'Pending', 'Nurse Maria Santos', 'Dr. Emily Rodriguez', NULL, 'Culture pending - results expected in 48-72 hours'),
('00000000-0000-0000-0000-000000000011', '2026-02-15T09:00:00Z', 'LAB-2024-007', 'Complete Blood Count (CBC) - Follow-up', 'Completed', 'Nurse Maria Santos', 'Dr. Sarah Johnson', '{"WBC":{"value":9.8,"unit":"10^3/μL","range":"4.5-11.0","flag":"Normal"},"RBC":{"value":4.9,"unit":"10^6/μL","range":"4.5-5.5","flag":"Normal"},"Hemoglobin":{"value":14.5,"unit":"g/dL","range":"13.5-17.5","flag":"Normal"},"Hematocrit":{"value":43.2,"unit":"%","range":"38-50","flag":"Normal"},"Platelets":{"value":250,"unit":"10^3/μL","range":"150-400","flag":"Normal"}}', 'WBC normalized. Infection resolving with treatment.') ON CONFLICT DO NOTHING;

-- Nurse Records
INSERT INTO nurse_records (patient_id, timestamp, nurse_id, nurse_name, shift, task_type, vital_signs, medication, notes) VALUES 
('00000000-0000-0000-0000-000000000011', '2026-02-14T08:00:00Z', 'RN005', 'Maria Santos, RN', 'Day', 'Vital Signs', '{"temperature":101.5,"temperatureUnit":"°F","bloodPressure":"130/85","heartRate":88,"respiratoryRate":22,"oxygenSaturation":94,"pain":3,"painScale":"0-10"}', NULL, 'Patient febrile. Acetaminophen 650mg given PO. Productive cough noted.'),
('00000000-0000-0000-0000-000000000011', '2026-02-14T12:00:00Z', 'RN005', 'Maria Santos, RN', 'Day', 'Medication Administration', NULL, 'Azithromycin 500mg PO', 'First dose administered. Patient tolerated well. No adverse reactions noted.'),
('00000000-0000-0000-0000-000000000011', '2026-02-14T16:00:00Z', 'RN007', 'James Lee, RN', 'Evening', 'Vital Signs', '{"temperature":100.2,"temperatureUnit":"°F","bloodPressure":"128/82","heartRate":82,"respiratoryRate":20,"oxygenSaturation":95,"pain":2,"painScale":"0-10"}', NULL, 'Temperature improving. Patient resting comfortably. Encouraged deep breathing exercises.'),
('00000000-0000-0000-0000-000000000011', '2026-02-14T20:00:00Z', 'RN007', 'James Lee, RN', 'Evening', 'IV Site Check', NULL, NULL, 'No IV currently. Patient on oral medications only.'),
('00000000-0000-0000-0000-000000000012', '2026-02-14T09:00:00Z', 'RN006', 'John Williams, RN', 'Day', 'Vital Signs', '{"temperature":98.4,"temperatureUnit":"°F","bloodPressure":"145/92","heartRate":118,"respiratoryRate":16,"oxygenSaturation":98,"pain":5,"painScale":"0-10"}', NULL, 'Heart rate irregular. ECG shows AFib. Patient reports chest discomfort. Cardiology consult requested.'),
('00000000-0000-0000-0000-000000000012', '2026-02-14T12:00:00Z', 'RN006', 'John Williams, RN', 'Day', 'Medication Administration', NULL, 'Metoprolol 25mg PO', 'First dose metoprolol given. Heart rate 110 bpm pre-dose. Will recheck in 1 hour.'),
('00000000-0000-0000-0000-000000000012', '2026-02-14T13:00:00Z', 'RN006', 'John Williams, RN', 'Day', 'Vital Signs', '{"temperature":98.6,"temperatureUnit":"°F","bloodPressure":"138/88","heartRate":95,"respiratoryRate":16,"oxygenSaturation":98,"pain":3,"painScale":"0-10"}', NULL, 'Heart rate decreasing. Patient feeling better. Continue to monitor rhythm.'),
('00000000-0000-0000-0000-000000000012', '2026-02-15T08:00:00Z', 'RN005', 'Maria Santos, RN', 'Day', 'Vital Signs', '{"temperature":98.6,"temperatureUnit":"°F","bloodPressure":"132/85","heartRate":75,"respiratoryRate":14,"oxygenSaturation":99,"pain":0,"painScale":"0-10"}', NULL, 'Heart rate well controlled. No chest pain. Patient ambulating without difficulty.'),
('00000000-0000-0000-0000-000000000013', '2026-02-13T14:00:00Z', 'RN005', 'Maria Santos, RN', 'Day', 'Vital Signs', '{"temperature":99.1,"temperatureUnit":"°F","bloodPressure":"118/75","heartRate":82,"respiratoryRate":16,"oxygenSaturation":98,"pain":6,"painScale":"0-10"}', NULL, 'Abdominal cramping. Multiple episodes of diarrhea. Oral rehydration started.'),
('00000000-0000-0000-0000-000000000013', '2026-02-13T18:00:00Z', 'RN007', 'James Lee, RN', 'Evening', 'Intake/Output Monitoring', NULL, NULL, 'Intake: 1200mL oral fluids. Output: 800mL urine, multiple loose stools. Continue hydration.'),
('00000000-0000-0000-0000-000000000011', '2026-02-15T08:00:00Z', 'RN005', 'Maria Santos, RN', 'Day', 'Vital Signs', '{"temperature":98.6,"temperatureUnit":"°F","bloodPressure":"125/80","heartRate":76,"respiratoryRate":18,"oxygenSaturation":97,"pain":1,"painScale":"0-10"}', NULL, 'Temperature normalized. Cough much improved. Patient ready for discharge.') ON CONFLICT DO NOTHING;

-- Imaging
INSERT INTO imaging (patient_id, timestamp, order_id, exam_type, indication, technique, radiologist_id, radiologist_name, status, findings, impression, recommendations, imaging_url) VALUES 
('00000000-0000-0000-0000-000000000011', '2026-02-14T10:45:00Z', 'IMG-2024-001', 'Chest X-Ray (PA and Lateral)', 'Cough, fever, shortness of breath - rule out pneumonia', 'Two-view chest radiograph acquired', 'RAD002', 'Dr. Robert Martinez, MD', 'Final Report', '{"summary":"Right lower lobe infiltrate consistent with pneumonia","heart":"Normal cardiac silhouette","lungs":"Patchy opacity in right lower lobe. No pleural effusion. Left lung clear.","bones":"No acute fractures. Mild degenerative changes in thoracic spine.","mediastinum":"Normal mediastinal contour"}', 'Right lower lobe pneumonia. No pleural effusion or pneumothorax.', 'Clinical correlation recommended. Follow-up imaging in 4-6 weeks to ensure resolution.', '/images/xray/an1_chest_20260214.dcm'),
('00000000-0000-0000-0000-000000000011', '2026-02-15T11:00:00Z', 'IMG-2024-002', 'Chest X-Ray (PA)', 'Follow-up pneumonia', 'Single-view chest radiograph', 'RAD002', 'Dr. Robert Martinez, MD', 'Final Report', '{"summary":"Interval improvement in right lower lobe infiltrate","heart":"Normal cardiac silhouette","lungs":"Decreased density in right lower lobe compared to prior. No new infiltrates.","bones":"Stable appearance","mediastinum":"Normal"}', 'Improving right lower lobe pneumonia. Good response to antibiotic therapy.', 'Continue current treatment. Repeat imaging only if clinically indicated.', '/images/xray/an1_chest_20260215.dcm'),
('00000000-0000-0000-0000-000000000012', '2026-02-14T14:30:00Z', 'IMG-2024-003', 'Chest X-Ray (PA and Lateral)', 'Atrial fibrillation, chest pain - evaluate cardiac size', 'Two-view chest radiograph', 'RAD003', 'Dr. Lisa Wong, MD', 'Final Report', '{"summary":"Mildly enlarged cardiac silhouette, lungs clear","heart":"Cardiothoracic ratio 0.52 (mildly enlarged). Left atrial enlargement noted.","lungs":"Clear lung fields bilaterally. No effusion or edema.","bones":"No acute abnormality","mediastinum":"Normal aortic contour"}', 'Mild cardiomegaly with left atrial enlargement, consistent with chronic AFib. No acute cardiopulmonary process.', 'Echocardiogram recommended for detailed cardiac assessment.', '/images/xray/an2_chest_20260214.dcm'),
('00000000-0000-0000-0000-000000000013', '2026-02-13T16:30:00Z', 'IMG-2024-004', 'Abdominal X-Ray (KUB)', 'Abdominal pain, diarrhea', 'Single supine view of abdomen', 'RAD002', 'Dr. Robert Martinez, MD', 'Final Report', '{"summary":"Normal bowel gas pattern, no obstruction","bowel":"Normal distribution of bowel gas. No dilated loops or air-fluid levels.","organs":"Liver and spleen normal in size. Kidneys symmetrical.","bones":"No acute fractures","soft tissues":"No abnormal calcifications or masses"}', 'Normal abdominal radiograph. No evidence of obstruction or perforation.', 'Clinical management as appropriate. No further imaging indicated at this time.', '/images/xray/an3_abd_20260213.dcm') ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Walk-in Queue: Departments and Routing Rules
-- ────────────────────────────────────────────────────────────────────────────

-- Departments for the existing 'GHB' hospital (00000000-0000-0000-0000-000000000001)
INSERT INTO departments (id, hospital_id, code, name_th, name_en, no_show_seconds) VALUES
  ('aaaa0000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', 'GP',     'ทั่วไป',      'General Practice',  300),
  ('aaaa0000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001', 'INTMED', 'อายุรกรรม',   'Internal Medicine', 300),
  ('aaaa0000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001', 'DERM',   'ผิวหนัง',     'Dermatology',       300),
  ('aaaa0000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000001', 'ENT',    'หู คอ จมูก',   'ENT',               300),
  ('aaaa0000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000001', 'OPHTH',  'จักษุ',       'Ophthalmology',     300),
  ('aaaa0000-0000-0000-0000-000000000006',
   '00000000-0000-0000-0000-000000000001', 'ORTHO',  'กระดูก',      'Orthopedics',       300),
  ('aaaa0000-0000-0000-0000-000000000007',
   '00000000-0000-0000-0000-000000000001', 'ER',     'ฉุกเฉิน',     'Emergency',         120),
  ('aaaa0000-0000-0000-0000-000000000008',
   '00000000-0000-0000-0000-000000000001', 'TRIAGE', 'จุดคัดกรอง',  'Triage',            600)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- Demo staff user for /login dev sign-in (Phase A of walk-in queue plan).
-- Email:    staff@demo.caremind.local
-- Password: caremind-dev
-- pgcrypto is enabled via the `extensions` schema in migration 00006,
-- so crypt()/gen_salt() are qualified explicitly.
-- =====================================================================
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, recovery_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '99999999-9999-9999-9999-999999999991',
  'authenticated',
  'authenticated',
  'staff@demo.caremind.local',
  extensions.crypt('caremind-dev', extensions.gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  NOW(), NOW(),
  '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES (
  '99999999-9999-9999-9999-999999999992',
  '99999999-9999-9999-9999-999999999991',
  '99999999-9999-9999-9999-999999999991',
  '{"sub":"99999999-9999-9999-9999-999999999991","email":"staff@demo.caremind.local","email_verified":true}',
  'email',
  NOW(), NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name, role, hospital_id)
VALUES (
  '99999999-9999-9999-9999-999999999991',
  'staff@demo.caremind.local',
  'Demo Staff',
  'doctor',
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- Routing rules: (symptom_code, severity → department). NULL severity = any.
-- `priority` ASC = first match wins.
INSERT INTO routing_rules (hospital_id, symptom_code, severity, target_department_id, priority) VALUES
  ('00000000-0000-0000-0000-000000000001', 'cough',   NULL,       'aaaa0000-0000-0000-0000-000000000002', 100),
  ('00000000-0000-0000-0000-000000000001', 'fever',   'severe',   'aaaa0000-0000-0000-0000-000000000002', 10),
  ('00000000-0000-0000-0000-000000000001', 'fever',   NULL,       'aaaa0000-0000-0000-0000-000000000001', 100),
  ('00000000-0000-0000-0000-000000000001', 'stomach', 'severe',   'aaaa0000-0000-0000-0000-000000000002', 10),
  ('00000000-0000-0000-0000-000000000001', 'stomach', NULL,       'aaaa0000-0000-0000-0000-000000000001', 100),
  ('00000000-0000-0000-0000-000000000001', 'injury',  'severe',   'aaaa0000-0000-0000-0000-000000000007', 10),
  ('00000000-0000-0000-0000-000000000001', 'injury',  NULL,       'aaaa0000-0000-0000-0000-000000000006', 100),
  ('00000000-0000-0000-0000-000000000001', 'skin',    NULL,       'aaaa0000-0000-0000-0000-000000000003', 100),
  ('00000000-0000-0000-0000-000000000001', 'eye_ent', NULL,       'aaaa0000-0000-0000-0000-000000000004', 100),
  ('00000000-0000-0000-0000-000000000001', 'other',   NULL,       'aaaa0000-0000-0000-0000-000000000001', 100)
ON CONFLICT DO NOTHING;
