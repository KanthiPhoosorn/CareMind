const fs = require('fs');
const path = require('path');

const sampleDir = path.join(__dirname, '../sample_data');
const outputFile = path.join(__dirname, '../supabase/seed.sql');

// Data
const docs = JSON.parse(fs.readFileSync(path.join(sampleDir, 'doc_clean.json')));
const drugs = JSON.parse(fs.readFileSync(path.join(sampleDir, 'drug_clean.json')));
const labs = JSON.parse(fs.readFileSync(path.join(sampleDir, 'lab_clean.json')));
const nurses = JSON.parse(fs.readFileSync(path.join(sampleDir, 'nurse_clean.json')));
const xrays = JSON.parse(fs.readFileSync(path.join(sampleDir, 'xray_clean.json')));

let sql = `-- CareMind Seed Data (Auto-generated)\n\n`;

// 1. Hospital
sql += `-- Hospitals\n`;
sql += `INSERT INTO hospitals (id, name, code) VALUES \n`;
const hospitalId = '00000000-0000-0000-0000-000000000001';
sql += `('${hospitalId}', 'General Hospital Bangkok', 'GHB') ON CONFLICT DO NOTHING;\n\n`;

// 2. Profiles (Optional, but let's add one doctor to allow login)
sql += `-- Profiles (Dummy auth user should be created via UI, but here is a profile)\n`;
// We will skip inserting into auth.users as it's complex in plain SQL, user can sign up.

// 3. Patients (an1, an2, an3)
sql += `-- Patients\n`;
const patientMap = {
  an1: '00000000-0000-0000-0000-000000000011',
  an2: '00000000-0000-0000-0000-000000000012',
  an3: '00000000-0000-0000-0000-000000000013',
};

sql += `INSERT INTO patients (id, hospital_id, admission_number, name, age, gender, ward, bed, admission_date, primary_diagnosis, attending_doctor, status) VALUES \n`;
sql += `('${patientMap.an1}', '${hospitalId}', 'an1', 'John Doe', 45, 'M', 'Ward A', 'Bed 1', '2026-02-10', 'Pneumonia', 'Dr. Sarah Johnson', 'Admitted'),\n`;
sql += `('${patientMap.an2}', '${hospitalId}', 'an2', 'Jane Smith', 62, 'F', 'Ward B', 'Bed 12', '2026-02-12', 'Atrial fibrillation', 'Dr. Michael Chen', 'Admitted'),\n`;
sql += `('${patientMap.an3}', '${hospitalId}', 'an3', 'Bob Wilson', 35, 'M', 'Ward C', 'Bed 5', '2026-02-13', 'Gastroenteritis', 'Dr. Emily Rodriguez', 'Admitted')\n`;
sql += `ON CONFLICT DO NOTHING;\n\n`;

// Helper for escaping
const esc = (str) => {
  if (str === null || str === undefined) return 'NULL';
  if (typeof str === 'object') return `'${JSON.stringify(str).replace(/'/g, "''")}'`;
  return `'${String(str).replace(/'/g, "''")}'`;
};

// 4. Doctor Notes
if (docs.length > 0) {
  sql += `-- Doctor Notes\n`;
  sql += `INSERT INTO doctor_notes (patient_id, timestamp, doctor_id, doctor_name, specialty, chief_complaint, diagnosis, assessment, plan, vital_signs, notes) VALUES \n`;
  const values = docs.map(
    (d) =>
      `('${patientMap[d.patientId]}', ${esc(d.timestamp)}, ${esc(d.doctorId)}, ${esc(d.doctorName)}, ${esc(d.specialty)}, ${esc(d.chiefComplaint)}, ${esc(d.diagnosis)}, ${esc(d.assessment)}, ${esc(d.plan)}, ${esc(d.vitalSigns)}, ${esc(d.notes)})`,
  );
  sql += values.join(',\n') + ` ON CONFLICT DO NOTHING;\n\n`;
}

// 5. Medications
if (drugs.length > 0) {
  sql += `-- Medications\n`;
  sql += `INSERT INTO medications (patient_id, timestamp, order_id, medication_name, dosage, route, frequency, duration, quantity, prescribed_by, indication, instructions, status, start_date, end_date) VALUES \n`;
  const values = drugs.map(
    (d) =>
      `('${patientMap[d.patientId]}', ${esc(d.timestamp)}, ${esc(d.orderId)}, ${esc(d.medicationName)}, ${esc(d.dosage)}, ${esc(d.route)}, ${esc(d.frequency)}, ${esc(d.duration)}, ${esc(d.quantity || 0)}, ${esc(d.prescribedBy)}, ${esc(d.indication)}, ${esc(d.instructions)}, ${esc(d.status)}, ${esc(d.startDate)}, ${esc(d.endDate || null)})`,
  );
  sql += values.join(',\n') + ` ON CONFLICT DO NOTHING;\n\n`;
}

// 6. Lab Results
if (labs.length > 0) {
  sql += `-- Lab Results\n`;
  sql += `INSERT INTO lab_results (patient_id, timestamp, order_id, test_name, status, collected_by, ordered_by, results, interpretation) VALUES \n`;
  const values = labs.map(
    (d) =>
      `('${patientMap[d.patientId]}', ${esc(d.timestamp)}, ${esc(d.orderId)}, ${esc(d.testName)}, ${esc(d.status)}, ${esc(d.collectedBy)}, ${esc(d.orderedBy)}, ${esc(d.results)}, ${esc(d.interpretation)})`,
  );
  sql += values.join(',\n') + ` ON CONFLICT DO NOTHING;\n\n`;
}

// 7. Nurse Records
if (nurses.length > 0) {
  sql += `-- Nurse Records\n`;
  sql += `INSERT INTO nurse_records (patient_id, timestamp, nurse_id, nurse_name, shift, task_type, vital_signs, medication, notes) VALUES \n`;
  const values = nurses.map(
    (d) =>
      `('${patientMap[d.patientId]}', ${esc(d.timestamp)}, ${esc(d.nurseId)}, ${esc(d.nurseName)}, ${esc(d.shift)}, ${esc(d.taskType)}, ${esc(d.vitalSigns)}, ${esc(d.medication)}, ${esc(d.notes)})`,
  );
  sql += values.join(',\n') + ` ON CONFLICT DO NOTHING;\n\n`;
}

// 8. Imaging
if (xrays.length > 0) {
  sql += `-- Imaging\n`;
  sql += `INSERT INTO imaging (patient_id, timestamp, order_id, exam_type, indication, technique, radiologist_id, radiologist_name, status, findings, impression, recommendations, imaging_url) VALUES \n`;
  const values = xrays.map(
    (d) =>
      `('${patientMap[d.patientId]}', ${esc(d.timestamp)}, ${esc(d.orderId)}, ${esc(d.examType)}, ${esc(d.indication)}, ${esc(d.technique)}, ${esc(d.radiologistId)}, ${esc(d.radiologistName)}, ${esc(d.status)}, ${esc(d.findings)}, ${esc(d.impression)}, ${esc(d.recommendations)}, ${esc(d.imagingUrl)})`,
  );
  sql += values.join(',\n') + ` ON CONFLICT DO NOTHING;\n\n`;
}

fs.writeFileSync(outputFile, sql);
console.log(`Successfully generated ${outputFile}`);
