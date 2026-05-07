'use client';

import { Sparkles, FlaskConical, Pill, Plus, Activity } from 'lucide-react';
import { SEV_BG, SEV_FG } from '@/lib/mock-data';
import React from 'react';

interface DeltaPanelProps {
  patient: any;
}

export function DeltaPanel({ patient }: DeltaPanelProps) {
  return (
    <aside style={{ width: 320, borderLeft: '1px solid var(--border)', background: '#fff', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ font: '600 12px/1 var(--font-ui)', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg3)' }}>Delta · Last 24h</span>
        <button style={{ background: 'transparent', border: 0, color: 'var(--fg3)', cursor: 'pointer', font: '500 11px/1 var(--font-ui)' }}>Change range</button>
      </div>
      <div style={{ padding: '12px 14px', background: 'var(--role-doctor-bg)', borderBottom: '1px solid var(--divider)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Sparkles style={{ width: 13, height: 13, color: 'var(--brand-primary)' }} />
          <span style={{ font: '600 11px/1 var(--font-ui)', color: 'var(--brand-primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>AI Summary</span>
        </div>
        <p style={{ font: '400 12px/1.55 var(--font-ui)', color: 'var(--fg2)', margin: 0 }}>
          Rate control achieved on metoprolol (HR 118 → 75). Anticoagulation initiated with apixaban 5mg BID. WBC normalized. No new abnormal findings.
        </p>
      </div>
      {[
        { ic: FlaskConical, sv: 'positive', cat: 'Lab · Improved', body: <>WBC normalized: <s style={{color:'var(--fg3)'}}>12.5</s> → <strong>9.8</strong></>, meta: 'CBC · Feb 15 09:30' },
        { ic: Pill, sv: 'warning', cat: 'Med · Dose changed', body: <>Metoprolol <s style={{color:'var(--fg3)'}}>25mg BID</s> → <strong>50mg BID</strong></>, meta: 'Dr. Chen · Feb 15 09:15' },
        { ic: Plus, sv: 'info', cat: 'Med · Added', body: <><strong>Apixaban 5mg BID</strong> started</>, meta: 'Anticoagulation · AFib protocol' },
        { ic: Activity, sv: 'positive', cat: 'Vitals · Trending', body: <>HR <s style={{color:'var(--fg3)'}}>118</s> → <strong>76</strong> bpm</>, meta: 'Improving over 24h' },
      ].map((d, i) => {
        const IconComponent = d.ic;
        return (
          <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)', display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: SEV_BG[d.sv], color: SEV_FG[d.sv], display: 'grid', placeItems: 'center' }}>
              <IconComponent style={{ width: 13, height: 13 }} />
            </div>
            <div>
              <div style={{ font: '600 10px/1 var(--font-ui)', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 4 }}>{d.cat}</div>
              <div style={{ font: '400 12px/1.4 var(--font-ui)', color: 'var(--fg2)' }}>{d.body}</div>
              <div style={{ font: '500 10px/1 var(--font-mono)', color: 'var(--fg3)', marginTop: 4 }}>{d.meta}</div>
            </div>
          </div>
        );
      })}
    </aside>
  );
}
