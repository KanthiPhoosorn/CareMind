export const APP_NAME = 'CareMind';
export const USER_ROLES = ['doctor', 'nurse', 'pharmacist', 'patient'] as const;
export const ROLE_LABELS: Record<string, string> = {
  doctor: 'Doctor', nurse: 'Nurse', pharmacist: 'Pharmacist', patient: 'Patient',
};
export const ROLE_COLORS: Record<string, string> = {
  doctor: '#2563EB', nurse: '#059669', pharmacist: '#7C3AED', patient: '#D97706',
};
export const SEVERITY_COLORS: Record<string, string> = {
  critical: '#DC2626', warning: '#F59E0B', info: '#3B82F6', positive: '#10B981',
};
export const DATA_CATEGORIES = ['doctor_notes','medications','lab_results','nurse_records','imaging'] as const;
export type DataCategory = (typeof DATA_CATEGORIES)[number];
