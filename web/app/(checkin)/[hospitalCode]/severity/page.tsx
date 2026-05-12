'use client';

// Step 2 of the check-in flow: patient rates severity (mild / moderate / severe).
// injury+severe is flagged as an ER case — the patient is shown a redirect
// interstitial instead of continuing to OTP, because they need immediate care
// and should not wait in a regular queue.
// Suspense is required here because useSearchParams() needs it in Next.js App Router.
import { Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';

const SEVERITIES = [
  {
    code: 'mild',
    label: 'Mild',
    labelTh: 'น้อย',
    desc: 'Minor discomfort, functioning normally',
    descTh: 'ไม่สบายเล็กน้อย ยังทำกิจกรรมได้ปกติ',
    color: 'var(--sev-positive)',
    bg: 'var(--sev-positive-bg)',
    border: '#10b98133',
  },
  {
    code: 'moderate',
    label: 'Moderate',
    labelTh: 'ปานกลาง',
    desc: 'Noticeable symptoms affecting daily activities',
    descTh: 'มีอาการชัดเจน กระทบชีวิตประจำวัน',
    color: 'var(--sev-warning)',
    bg: 'var(--sev-warning-bg)',
    border: '#f59e0b33',
  },
  {
    code: 'severe',
    label: 'Severe',
    labelTh: 'รุนแรง',
    desc: 'Strong symptoms, needs urgent attention',
    descTh: 'อาการรุนแรง ต้องรับการรักษาเร่งด่วน',
    color: 'var(--sev-critical)',
    bg: 'var(--sev-critical-bg)',
    border: '#dc262633',
  },
] as const;

// Combinations that should redirect to the ER interstitial instead of the queue
const ER_FLAGS = new Set(['injury+severe']);

function SeverityContent() {
  const router = useRouter();
  const { hospitalCode } = useParams<{ hospitalCode: string }>();
  const searchParams = useSearchParams();
  const symptom = searchParams.get('symptom') ?? 'other';
  const isEr = searchParams.get('er') === '1';

  const pick = (severityCode: string) => {
    if (ER_FLAGS.has(`${symptom}+${severityCode}`)) {
      router.push(`/${hospitalCode}/severity?symptom=${symptom}&er=1`);
      return;
    }
    router.push(`/${hospitalCode}/verify?symptom=${symptom}&severity=${severityCode}`);
  };

  if (isEr) {
    return (
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, paddingTop: 24 }}>
        <div style={{ fontSize: 64 }}>🚨</div>
        <div>
          <div style={{ font: '700 22px/1.2 var(--font-ui)', color: 'var(--sev-critical)' }}>
            Please go to the Emergency Room
          </div>
          <div style={{ font: '600 16px/1.4 var(--font-ui)', color: 'var(--sev-critical)', marginTop: 4 }}>
            กรุณาไปห้องฉุกเฉิน
          </div>
        </div>
        <div style={{ font: '400 14px/1.6 var(--font-ui)', color: 'var(--fg2)', maxWidth: 300 }}>
          Your symptoms require immediate attention. Head to the Emergency Room directly — do not wait in the queue.
        </div>
        <a
          href={`/${hospitalCode}`}
          style={{ padding: '12px 24px', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', font: '500 14px/1 var(--font-ui)', color: 'var(--fg2)', textDecoration: 'none' }}
        >
          ← Back to home
        </a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ font: '700 22px/1.2 var(--font-ui)', letterSpacing: '-0.01em', color: 'var(--fg1)' }}>
          How severe are your symptoms?
        </div>
        <div style={{ font: '400 14px/1.5 var(--font-ui)', color: 'var(--fg3)', marginTop: 4 }}>
          อาการของคุณอยู่ในระดับใด?
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SEVERITIES.map(({ code, label, labelTh, desc, descTh, color, bg, border }) => (
          <button
            key={code}
            onClick={() => pick(code)}
            style={{
              padding: '20px',
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 'var(--r-xl)',
              cursor: 'pointer',
              textAlign: 'left',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ font: '700 16px/1 var(--font-ui)', color }}>
              {label}{' '}
              <span style={{ fontWeight: 400, fontSize: 14 }}>· {labelTh}</span>
            </div>
            <div style={{ font: '400 13px/1.5 var(--font-ui)', color: 'var(--fg2)', marginTop: 6 }}>{desc}</div>
            <div style={{ font: '400 12px/1.5 var(--font-ui)', color: 'var(--fg3)', marginTop: 2 }}>{descTh}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SeverityPage() {
  return (
    <Suspense>
      <SeverityContent />
    </Suspense>
  );
}
