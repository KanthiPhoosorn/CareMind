'use client';

import { Header } from '@/components/ui/Header';
import { PatientDetail } from '@/components/ui/PatientDetail';
import { useRole } from '@/lib/RoleContext';
import { WEB_PATIENTS } from '@/lib/mock-data';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function PatientDetailPage() {
  const { role, setRole } = useRole();
  const router = useRouter();
  const params = useParams();
  const [patient, setPatient] = useState<any>(null);

  useEffect(() => {
    const an = params.an as string;
    const found = WEB_PATIENTS.find(p => p.an === an);
    if (found) {
      setPatient(found);
    }
  }, [params.an]);

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    if (newRole === 'pharmacist') {
      router.push('/pharmacy/queue');
    } else {
      router.push('/patients');
    }
  };

  if (!patient) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header role={role} setRole={handleRoleChange} title="Loading..." sub="" />
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--fg3)', font: '400 13px var(--font-ui)' }}>
          Loading patient details...
        </div>
      </div>
    );
  }

  return (
    <>
      <Header 
        role={role} 
        setRole={handleRoleChange} 
        title={patient.name} 
        sub={`AN ${patient.an} · ${patient.ward} · Bed ${patient.bed}`} 
      />
      <PatientDetail 
        patient={patient} 
        onBack={() => router.push('/patients')} 
        onAI={() => { /* AI Consult Mock */ }} 
      />
    </>
  );
}
