'use client';

import { Filter } from 'lucide-react';
import { WEB_PATIENTS, ROLE_COLOR, ROLE_BG, SEV_BG, SEV_FG } from '@/lib/mock-data';

interface PatientListProps {
  role: string;
  onOpen: (patient: any) => void;
}

export function PatientList({ role, onOpen }: PatientListProps) {
  const c = ROLE_COLOR[role] || ROLE_COLOR['doctor'];

  return (
    <div style={{ padding: 24, flex: 1, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button style={{ font: '500 12px/1 var(--font-ui)', padding: '7px 11px', borderRadius: 6, border: '1px solid var(--border-strong)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Filter style={{ width: 14, height: 14 }} />All wards
        </button>
        <button style={{ font: '500 12px/1 var(--font-ui)', padding: '7px 11px', borderRadius: 6, border: '1px solid var(--border-strong)', background: '#fff', cursor: 'pointer' }}>Status: any</button>
        <button style={{ font: '500 12px/1 var(--font-ui)', padding: '7px 11px', borderRadius: 6, border: '1px solid var(--border-strong)', background: '#fff', cursor: 'pointer' }}>Doctor: me</button>
        <div style={{ flex: 1 }}></div>
        <button style={{ font: '600 12px/1 var(--font-ui)', padding: '8px 12px', borderRadius: 6, border: 0, background: c, color: '#fff', cursor: 'pointer' }}>+ Admit patient</button>
      </div>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '70px 1.4fr 130px 1.6fr 110px 110px', padding: '10px 16px', background: 'var(--bg-sunken)', font: '600 10px/1 var(--font-ui)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg3)' }}>
          <span>AN</span><span>Patient</span><span>Ward · Bed</span><span>Diagnosis</span><span>Status</span><span>Doctor</span>
        </div>
        {WEB_PATIENTS.map((p, i) => (
          <div key={p.an} onClick={() => onOpen(p)} style={{ display: 'grid', gridTemplateColumns: '70px 1.4fr 130px 1.6fr 110px 110px', padding: '14px 16px', alignItems: 'center', borderTop: i ? '1px solid var(--divider)' : '0', cursor: 'pointer' }}
            onMouseEnter={(e) => e.currentTarget.style.background = ROLE_BG[role] || 'transparent'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <span style={{ font: '500 12px/1 var(--font-mono)', color: 'var(--fg2)' }}>{p.an}</span>
            <div>
              <div style={{ font: '600 13px/1.2 var(--font-ui)' }}>{p.name}</div>
              <div style={{ font: '400 11px/1 var(--font-ui)', color: 'var(--fg3)', marginTop: 3 }}>{p.age} · {p.sex}</div>
            </div>
            <span style={{ font: '500 12px/1 var(--font-ui)', color: 'var(--fg2)' }}>{p.ward} · {p.bed}</span>
            <span style={{ font: '400 13px/1.3 var(--font-ui)', color: 'var(--fg2)' }}>{p.dx}</span>
            <span style={{ display: 'inline-flex', alignSelf: 'flex-start', padding: '3px 8px', borderRadius: 9999, font: '600 10px/1 var(--font-ui)', letterSpacing: '0.06em', textTransform: 'uppercase', background: SEV_BG[p.sev], color: SEV_FG[p.sev] }}>{p.status}</span>
            <span style={{ font: '500 12px/1 var(--font-ui)', color: 'var(--fg3)' }}>{p.doctor.replace('Dr. ', '')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
