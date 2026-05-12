// Landing page for a hospital's check-in URL (e.g. /HOSP01).
// Patients arrive here by scanning a QR code posted at the entrance.
// hospitalCode is passed through to all subsequent steps via the URL.
interface Props {
  params: Promise<{ hospitalCode: string }>;
}

export default async function CheckinLanding({ params }: Props) {
  const { hospitalCode } = await params;

  return (
    <div style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, paddingTop: 48 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ font: '700 32px/1.1 var(--font-ui)', letterSpacing: '-0.02em', color: 'var(--fg1)', marginBottom: 8 }}>
          Welcome
        </div>
        <div style={{ font: '400 16px/1.5 var(--font-ui)', color: 'var(--fg3)' }}>
          Get a queue number — no paper ticket needed
        </div>
        <div style={{ font: '400 13px/1.5 var(--font-ui)', color: 'var(--fg4)', marginTop: 4 }}>
          รับคิวออนไลน์ ไม่ต้องถือบัตรคิว
        </div>
      </div>

      <a
        href={`/${hospitalCode}/symptom`}
        style={{
          display: 'block',
          width: '100%',
          padding: '18px',
          background: 'var(--brand-primary)',
          color: '#fff',
          borderRadius: 'var(--r-xl)',
          font: '600 16px/1 var(--font-ui)',
          textAlign: 'center',
          textDecoration: 'none',
          boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
        }}
      >
        Get a queue number
        <div style={{ font: '400 13px/1 var(--font-ui)', marginTop: 6, opacity: 0.85 }}>รับบัตรคิว</div>
      </a>
    </div>
  );
}
