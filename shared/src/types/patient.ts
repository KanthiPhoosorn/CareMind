export type AdmissionNumber = string;
export type UserRole = 'doctor' | 'nurse' | 'pharmacist' | 'patient';

// 1. Doctor Notes
export interface VitalSigns {
  temperature: number;
  bloodPressure: string;
  heartRate: number;
  respiratoryRate: number;
  oxygenSaturation: number;
}

export interface DoctorNote {
  id: string;
  patientId: AdmissionNumber;
  timestamp: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  chiefComplaint: string;
  diagnosis: string;
  assessment: string;
  plan: string;
  vitalSigns: VitalSigns;
  notes: string;
}

// 2. Medications
export type MedicationStatus = 'Active' | 'Completed' | 'Discontinued';
export type MedicationRoute = 'Oral' | 'IV' | 'IM' | 'Topical' | 'Inhaled' | 'Subcutaneous';

export interface Medication {
  id: string;
  patientId: AdmissionNumber;
  timestamp: string;
  orderId: string;
  medicationName: string;
  dosage: string;
  route: MedicationRoute | string;
  frequency: string;
  duration: string;
  quantity: number;
  prescribedBy: string;
  indication: string;
  instructions: string;
  status: MedicationStatus;
  startDate: string;
  endDate: string | null;
}

// 3. Lab Results
export type LabFlag = 'Normal' | 'High' | 'Low' | 'Critical';
export type LabStatus = 'Completed' | 'Pending' | 'In Progress';

export interface LabResultValue {
  value: number;
  unit: string;
  range: string;
  flag: LabFlag;
}

export interface LabResult {
  id: string;
  patientId: AdmissionNumber;
  timestamp: string;
  orderId: string;
  testName: string;
  status: LabStatus;
  collectedBy: string;
  orderedBy: string;
  results: Record<string, LabResultValue> | null;
  interpretation: string;
}

// 4. Nurse Records
export interface NurseVitalSigns extends VitalSigns {
  temperatureUnit: string;
  pain: number;
  painScale: string;
}

export interface NurseRecord {
  id: string;
  patientId: AdmissionNumber;
  timestamp: string;
  nurseId: string;
  nurseName: string;
  shift: 'Day' | 'Evening' | 'Night';
  taskType: string;
  vitalSigns?: NurseVitalSigns;
  medication?: string;
  notes: string;
}

// 5. Imaging
export type ImagingStatus = 'Final Report' | 'Preliminary' | 'Pending';

export interface ImagingRecord {
  id: string;
  patientId: AdmissionNumber;
  timestamp: string;
  orderId: string;
  examType: string;
  indication: string;
  technique: string;
  radiologistId: string;
  radiologistName: string;
  status: ImagingStatus;
  findings: { summary: string; [bodyPart: string]: string };
  impression: string;
  recommendations: string;
  imagingUrl: string;
}

// Patient Summary
export interface Patient {
  admissionNumber: AdmissionNumber;
  name: string;
  age: number;
  gender: 'M' | 'F' | 'Other';
  ward: string;
  bed: string;
  admissionDate: string;
  primaryDiagnosis: string;
  attendingDoctor: string;
  status: 'Admitted' | 'Discharged' | 'Transfer' | 'Critical';
}

export interface PatientTimeline {
  patient: Patient;
  doctorNotes: DoctorNote[];
  medications: Medication[];
  labResults: LabResult[];
  nurseRecords: NurseRecord[];
  imaging: ImagingRecord[];
}

// Delta Summary
export type ChangeType = 'added' | 'removed' | 'changed' | 'unchanged';
export type Severity = 'critical' | 'warning' | 'info' | 'positive';

export interface DeltaItem {
  category: 'diagnosis' | 'medication' | 'lab' | 'vitals' | 'imaging';
  changeType: ChangeType;
  severity: Severity;
  field: string;
  previousValue?: string;
  currentValue: string;
  timestamp: string;
  summary: string;
}

export interface DeltaSummary {
  patientId: AdmissionNumber;
  fromTimestamp: string;
  toTimestamp: string;
  changes: DeltaItem[];
  aiSummary?: string;
}
