export const WEB_PATIENTS = [
  { an: 'an1', name: 'Somchai T.', age: 62, sex: 'M', ward: 'Med 3A', bed: '07', dx: 'Acute bronchitis — improving', status: 'Improved', sev: 'positive', doctor: 'Dr. Sarah Johnson' },
  { an: 'an2', name: 'Mr. Chen', age: 67, sex: 'M', ward: 'Cardio 4B', bed: '12', dx: 'AFib — rate controlled', status: 'Critical', sev: 'critical', doctor: 'Dr. Michael Chen' },
  { an: 'an3', name: 'Pranee K.', age: 34, sex: 'F', ward: 'Med 3A', bed: '02', dx: 'Acute gastroenteritis', status: 'Admitted', sev: 'info', doctor: 'Dr. Emily Rodriguez' },
  { an: 'an4', name: 'Niran S.', age: 71, sex: 'M', ward: 'Cardio 4B', bed: '08', dx: 'CHF, NYHA II', status: 'Stable', sev: 'info', doctor: 'Dr. Michael Chen' },
  { an: 'an5', name: 'Suda P.', age: 28, sex: 'F', ward: 'OBGyn 6A', bed: '04', dx: 'Pre-eclampsia, monitored', status: 'Warning', sev: 'warning', doctor: 'Dr. Anong P.' },
];

export const SEV_BG: Record<string, string> = { critical: '#FEF2F2', warning: '#FFFBEB', info: '#EFF6FF', positive: '#ECFDF5' };
export const SEV_FG: Record<string, string> = { critical: '#DC2626', warning: '#B45309', info: '#1D4ED8', positive: '#047857' };

export const ROLE_COLOR: Record<string, string> = { doctor: '#2563EB', nurse: '#059669', pharmacist: '#7C3AED', patient: '#D97706' };
export const ROLE_BG: Record<string, string> = { doctor: '#EFF4FE', nurse: '#ECFDF5', pharmacist: '#F3EEFE', patient: '#FEF6E7' };
