'use client';

import React from 'react';
import { Sidebar } from '@/components/ui/Sidebar';
import { usePathname, useRouter } from 'next/navigation';
import { RoleProvider, useRole } from '@/lib/RoleContext';

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { role } = useRole();
  const pathname = usePathname();
  const router = useRouter();

  // /queue/triage must be checked before /queue, /queue before /patients,
  // /pharmacy/queue before all of them, to avoid false prefix matches.
  let view = 'patients';
  if (pathname.includes('/pharmacy/queue')) view = 'queue';
  else if (pathname.startsWith('/queue/triage')) view = 'triage';
  else if (pathname.startsWith('/queue')) view = 'walkin';
  else if (pathname.includes('/patients')) view = 'patients';

  const isPharmacist = role === 'pharmacist';

  const setView = (v: string) => {
    if (v === 'patients') router.push('/patients');
    else if (v === 'queue') router.push('/pharmacy/queue');
    else if (v === 'walkin') router.push('/queue');
    else if (v === 'triage') router.push('/queue/triage');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-app)' }}>
      <Sidebar
        role={role}
        view={isPharmacist ? (view === 'patients' ? 'queue' : view) : view}
        setView={setView}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </RoleProvider>
  );
}
