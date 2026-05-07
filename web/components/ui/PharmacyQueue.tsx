'use client';

import { AlertTriangle } from 'lucide-react';
import { SEV_BG, SEV_FG } from '@/lib/mock-data';

export function PharmacyQueue() {
  const items = [
    { id: 'RX-2026-0118', med: 'Apixaban 5mg', pt: 'Mr. Chen · an2', dr: 'Dr. Chen', alert: 'Bleeding risk: confirm renal fn', sev: 'warning' },
    { id: 'RX-2026-0117', med: 'Azithromycin 500mg', pt: 'Somchai T. · an1', dr: 'Dr. Johnson', alert: null, sev: null },
    { id: 'RX-2026-0116', med: 'Ondansetron 4mg PRN', pt: 'Pranee K. · an3', dr: 'Dr. Rodriguez', alert: null, sev: null },
    { id: 'RX-2026-0115', med: 'Ibuprofen 400mg', pt: 'Mr. Chen · an2', dr: 'Dr. Chen', alert: 'CRITICAL: interacts with apixaban', sev: 'critical' },
  ];
  return (
    <div style={{ padding: 24, flex: 1, overflow: 'auto' }}>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1.4fr 1.4fr 130px 110px', padding: '10px 16px', background: 'var(--bg-sunken)', font: '600 10px/1 var(--font-ui)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg3)' }}>
          <span>Order</span><span>Medication</span><span>Patient</span><span>Prescriber</span><span></span>
        </div>
        {items.map((it, i) => (
          <div key={it.id} style={{ borderTop: i ? '1px solid var(--divider)' : '0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1.4fr 1.4fr 130px 110px', padding: '12px 16px', alignItems: 'center' }}>
              <span style={{ font: '500 12px/1 var(--font-mono)', color: 'var(--fg2)' }}>{it.id}</span>
              <span style={{ font: '600 13px/1.2 var(--font-ui)' }}>{it.med}</span>
              <span style={{ font: '400 12px/1 var(--font-ui)', color: 'var(--fg2)' }}>{it.pt}</span>
              <span style={{ font: '500 12px/1 var(--font-ui)', color: 'var(--fg3)' }}>{it.dr}</span>
              <button style={{ font: '600 12px/1 var(--font-ui)', padding: '7px 11px', borderRadius: 6, border: 0, background: 'var(--role-pharmacist)', color: '#fff', cursor: 'pointer' }}>Dispense</button>
            </div>
            {it.alert && it.sev && (
              <div style={{ padding: '10px 16px', background: SEV_BG[it.sev], display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--divider)' }}>
                <AlertTriangle style={{ width: 14, height: 14, color: SEV_FG[it.sev] }} />
                <span style={{ font: '500 12px/1.4 var(--font-ui)', color: SEV_FG[it.sev] }}>{it.alert}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
