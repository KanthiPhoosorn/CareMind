'use client';

import { Header } from '@/components/ui/Header';
import { PatientList } from '@/components/ui/PatientList';
import { useRole } from '@/lib/RoleContext';
import { useRouter } from 'next/navigation';

export default function PatientsPage() {
  const { role, setRole } = useRole();
  const router = useRouter();

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    if (newRole === 'pharmacist') {
      router.push('/pharmacy/queue');
    }
  };

  const handleOpenPatient = (patient: any) => {
    router.push(`/patients/${patient.an}`);
  };

  const titleMap: Record<string, string> = { doctor: 'Patients', nurse: 'My rounds', pharmacist: 'Pharmacy queue' };
  const subMap: Record<string, string> = { doctor: '5 admitted · 2 need attention', nurse: '5 admitted · 2 need attention', pharmacist: '4 orders pending review' };

  return (
    <>
      <Header 
        role={role} 
        setRole={handleRoleChange} 
        title={titleMap[role] || 'Patients'} 
        sub={subMap[role] || ''} 
      />
      {role === 'pharmacist' ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--fg3)', font: '400 13px var(--font-ui)' }}>
          <div>Redirecting to Pharmacy Queue...</div>
        </div>
      ) : (
        <PatientList role={role} onOpen={handleOpenPatient} />
      )}
    </>
  );
}
