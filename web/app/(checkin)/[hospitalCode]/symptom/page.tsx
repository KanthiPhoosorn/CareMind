'use client';

// Step 1 of the check-in flow: patient picks their primary symptom.
// The selected symptom code is passed as a query param to /severity.
import { useRouter, useParams } from 'next/navigation';

const SYMPTOMS = [
  { code: 'cough',   label: 'Cough / Respiratory', labelTh: 'ไอ / หายใจ',       icon: '🤧' },
  { code: 'fever',   label: 'Fever',                labelTh: 'ไข้',               icon: '🌡️' },
  { code: 'stomach', label: 'Stomach / Abdominal',  labelTh: 'ปวดท้อง',           icon: '🤢' },
  { code: 'injury',  label: 'Injury / Wound',       labelTh: 'บาดเจ็บ',           icon: '🩹' },
  { code: 'skin',    label: 'Skin / Rash',          labelTh: 'ผิวหนัง / ผื่น',   icon: '🧴' },
  { code: 'eye_ent', label: 'Eye / Ear / Throat',   labelTh: 'ตา หู คอ จมูก',    icon: '👁️' },
  { code: 'other',   label: 'Other',                labelTh: 'อื่นๆ',             icon: '❓' },
] as const;

export default function SymptomPage() {
  const router = useRouter();
  const { hospitalCode } = useParams<{ hospitalCode: string }>();

  const pick = (code: string) =>
    router.push(`/${hospitalCode}/severity?symptom=${code}`);

  return (
    <div style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ font: '700 22px/1.2 var(--font-ui)', letterSpacing: '-0.01em', color: 'var(--fg1)' }}>
          What brings you in today?
        </div>
        <div style={{ font: '400 14px/1.5 var(--font-ui)', color: 'var(--fg3)', marginTop: 4 }}>
          วันนี้มาด้วยอาการใด?
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {SYMPTOMS.map(({ code, label, labelTh, icon }) => (
          <button
            key={code}
            onClick={() => pick(code)}
            style={{
              padding: '20px 12px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <span style={{ fontSize: 32 }}>{icon}</span>
            <span style={{ font: '600 13px/1.3 var(--font-ui)', color: 'var(--fg1)', textAlign: 'center' }}>{label}</span>
            <span style={{ font: '400 12px/1.3 var(--font-ui)', color: 'var(--fg3)' }}>{labelTh}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
