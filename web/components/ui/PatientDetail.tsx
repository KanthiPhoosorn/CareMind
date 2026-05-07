'use client';

import React, { useState } from 'react';
import { ArrowLeft, Sparkles, Stethoscope, Pill } from 'lucide-react';
import { SEV_BG, SEV_FG } from '@/lib/mock-data';
import { DeltaPanel } from './DeltaPanel';

interface PatientDetailProps {
  patient: any;
  onBack: () => void;
  onAI: () => void;
}

export function PatientDetail({ patient, onBack, onAI }: PatientDetailProps) {
  const [tab, setTab] = useState('notes');
  const tabs = [['notes', 'Notes'], ['meds', 'Meds'], ['labs', 'Labs'], ['vitals', 'Vitals'], ['imaging', 'Imaging']];
  const sevBg = SEV_BG[patient.sev];
  const sevFg = SEV_FG[patient.sev];
  
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <button onClick={onBack} style={{ font: '500 12px/1 var(--font-ui)', color: 'var(--fg3)', background: 'transparent', border: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 14 }}>
          <ArrowLeft style={{ width: 14, height: 14 }} />Back to patients
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ font: '500 12px/1 var(--font-mono)', color: 'var(--fg3)' }}>AN {patient.an}</span>
              <span style={{ font: '700 22px/1.1 var(--font-ui)', letterSpacing: '-0.01em' }}>{patient.name}</span>
              <span style={{ font: '400 13px/1 var(--font-ui)', color: 'var(--fg3)' }}>{patient.age} · {patient.sex}</span>
              <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 9999, font: '600 10px/1 var(--font-ui)', letterSpacing: '0.06em', textTransform: 'uppercase', background: sevBg, color: sevFg }}>{patient.status}</span>
            </div>
            <div style={{ font: '400 13px/1.4 var(--font-ui)', color: 'var(--fg2)', marginTop: 8 }}>{patient.ward} · Bed {patient.bed} · Admitted Feb 14 · Attending {patient.doctor}</div>
            <div style={{ font: '500 14px/1.4 var(--font-ui)', color: 'var(--fg1)', marginTop: 12 }}>{patient.dx}</div>
          </div>
          <button onClick={onAI} style={{ font: '600 12px/1 var(--font-ui)', padding: '9px 13px', borderRadius: 6, border: '1px solid var(--brand-primary)', color: 'var(--brand-primary)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Sparkles style={{ width: 14, height: 14 }} />Open AI consult
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ font: '600 13px/1 var(--font-ui)' }}>Vital Signs</span>
            <span style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--fg3)' }}>Today 09:30 · Rita T., RN</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
            {[['Temp', '98.6', '°F', '↓ 2.9°', 'positive'], ['BP', '125/80', '', '↓ from 130/85', 'positive'], ['HR', '76', 'bpm', '↓ 12', 'positive'], ['RR', '18', '/min', '— stable', 'flat'], ['SpO₂', '97', '%', '↑ from 94%', 'positive']].map(([k, v, u, t, s], i) => (
              <div key={i}>
                <div style={{ font: '600 10px/1 var(--font-ui)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 4 }}>{k}</div>
                <div><span style={{ font: '600 18px/1 var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{v}</span><span style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--fg3)', marginLeft: 3 }}>{u}</span></div>
                <div style={{ font: '500 10px/1 var(--font-ui)', marginTop: 4, color: s === 'positive' ? 'var(--sev-positive)' : 'var(--fg3)' }}>{t}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: 0, marginBottom: 16 }}>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ font: '600 13px/1 var(--font-ui)', padding: '10px 16px', background: 'transparent', border: 0, borderBottom: tab === k ? '2px solid var(--brand-primary)' : '2px solid transparent', color: tab === k ? 'var(--fg1)' : 'var(--fg3)', cursor: 'pointer', marginBottom: -1 }}>{l}</button>
          ))}
        </div>

        {tab === 'notes' && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--role-doctor-bg)', color: 'var(--role-doctor)', display: 'grid', placeItems: 'center' }}>
                <Stethoscope style={{ width: 16, height: 16 }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ font: '600 13px/1 var(--font-ui)' }}>{patient.doctor} · Cardiology</div>
                <div style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--fg3)', marginTop: 3 }}>Feb 15, 09:15</div>
              </div>
            </div>
            <p style={{ font: '400 13px/1.6 var(--font-ui)', color: 'var(--fg2)', margin: '8px 0 0' }}>
              <strong style={{ color: 'var(--fg1)' }}>Assessment:</strong> Heart rate improved to 70–80 bpm on metoprolol. Patient tolerating medication well.<br/>
              <strong style={{ color: 'var(--fg1)' }}>Plan:</strong> Increase metoprolol to 50mg BID. Start apixaban 5mg BID for anticoagulation. Echo scheduled for next week.
            </p>
          </div>
        )}
        {tab === 'meds' && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {[['Metoprolol', '50mg BID · Oral', 'Active', 'positive'], ['Apixaban', '5mg BID · Oral', 'Active', 'info'], ['Lisinopril', '10mg daily · Oral', 'Active', 'positive']].map(([n, d, s, sv], i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 12, padding: '12px 16px', borderTop: i ? '1px solid var(--divider)' : '0', alignItems: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--role-pharmacist-bg)', color: 'var(--role-pharmacist)', display: 'grid', placeItems: 'center' }}>
                  <Pill style={{ width: 16, height: 16 }} />
                </div>
                <div>
                  <div style={{ font: '600 13px/1.2 var(--font-ui)' }}>{n}</div>
                  <div style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--fg3)', marginTop: 4 }}>{d}</div>
                </div>
                <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 9999, font: '600 10px/1 var(--font-ui)', letterSpacing: '0.06em', textTransform: 'uppercase', background: SEV_BG[sv], color: SEV_FG[sv] }}>{s}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'labs' && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
            <div style={{ font: '600 13px/1 var(--font-ui)', marginBottom: 10 }}>CBC · Feb 15, 09:30 · Final</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', rowGap: 8 }}>
              {[['WBC', '9.8', '×10⁹/L', 'Normal', 'positive'], ['RBC', '4.6', '×10¹²/L', 'Normal', 'positive'], ['Hgb', '13.1', 'g/dL', 'Low', 'warning'], ['Plt', '242', '×10⁹/L', 'Normal', 'positive']].map(([k, v, u, f, sv], i) => (
                <React.Fragment key={i}>
                  <span style={{ font: '500 13px/1 var(--font-ui)', color: 'var(--fg2)' }}>{k}</span>
                  <span style={{ font: '500 13px/1 var(--font-mono)', textAlign: 'right' }}>{v}</span>
                  <span style={{ font: '500 12px/1 var(--font-mono)', color: 'var(--fg3)', padding: '0 12px' }}>{u}</span>
                  <span style={{ display: 'inline-flex', padding: '2px 6px', borderRadius: 4, font: '500 10px/1 var(--font-mono)', background: SEV_BG[sv], color: SEV_FG[sv] }}>{f.toUpperCase()}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
        {tab === 'vitals' && <div style={{ font: '400 13px var(--font-ui)', color: 'var(--fg3)', padding: 24, textAlign: 'center' }}>Vital trend chart placeholder.</div>}
        {tab === 'imaging' && <div style={{ font: '400 13px var(--font-ui)', color: 'var(--fg3)', padding: 24, textAlign: 'center' }}>Chest X-Ray PA · Final · Feb 14 — placeholder thumbnail</div>}
      </div>

      <DeltaPanel patient={patient} />
    </div>
  );
}
