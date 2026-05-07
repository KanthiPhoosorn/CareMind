'use client';

import { Header } from '@/components/ui/Header';
import { PharmacyQueue } from '@/components/ui/PharmacyQueue';
import { useRole } from '@/lib/RoleContext';
import { useRouter } from 'next/navigation';

export default function PharmacyQueuePage() {
  const { role, setRole } = useRole();
  const router = useRouter();

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    if (newRole !== 'pharmacist') {
      router.push('/patients');
    }
  };

  return (
    <>
      <Header 
        role={role} 
        setRole={handleRoleChange} 
        title="Pharmacy queue" 
        sub="4 orders pending review" 
      />
      {role !== 'pharmacist' ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--fg3)', font: '400 13px var(--font-ui)' }}>
          <div>Redirecting to Patients...</div>
        </div>
      ) : (
        <PharmacyQueue />
      )}
    </>
  );
}
