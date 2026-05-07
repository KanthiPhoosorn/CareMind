import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--bg-app)', color: 'var(--fg1)' }}
    >
      <header
        className="flex items-center px-6"
        style={{
          height: 56,
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <Image
          src="/brand/caremind-wordmark.svg"
          alt="CareMind"
          width={140}
          height={32}
          priority
        />
      </header>

      <section
        className="flex-1 flex items-center justify-center px-6"
        style={{ paddingBlock: 'var(--s-12)' }}
      >
        <div className="w-full max-w-2xl text-center" style={{ display: 'grid', gap: 'var(--s-6)' }}>
          <p className="micro" style={{ color: 'var(--role-doctor)' }}>
            One patient, one timeline
          </p>

          <h1 className="display">AI-powered patient care coordination.</h1>

          <p className="body" style={{ fontSize: 16, color: 'var(--fg2)' }}>
            CareMind surfaces what changed for a patient since the last shift — new diagnosis,
            worsening labs, medications started yesterday — so handoffs are fast and nothing slips
            between clinicians.
          </p>

          <div
            className="flex items-center justify-center"
            style={{ gap: 'var(--s-3)', marginTop: 'var(--s-2)' }}
          >
            <Link
              href="/patients"
              className="inline-flex items-center justify-center"
              style={{
                background: 'var(--role-doctor)',
                color: '#fff',
                font: '600 14px/1 var(--font-ui)',
                padding: '12px 20px',
                borderRadius: 'var(--r-md)',
                boxShadow: 'var(--shadow-card)',
                transition: 'opacity var(--d-fast) var(--ease-standard)',
              }}
            >
              Sign in
            </Link>

            <Link
              href="#how-it-works"
              className="inline-flex items-center justify-center"
              style={{
                background: 'var(--bg-surface)',
                color: 'var(--fg1)',
                font: '600 14px/1 var(--font-ui)',
                padding: '12px 20px',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border-strong)',
              }}
            >
              How it works
            </Link>
          </div>

          <div
            id="how-it-works"
            className="grid"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--s-3)',
              marginTop: 'var(--s-8)',
              textAlign: 'left',
            }}
          >
            {[
              {
                role: 'Doctor',
                color: 'var(--role-doctor)',
                bg: 'var(--role-doctor-bg)',
                copy: 'Patient list, delta summary, AI consult.',
              },
              {
                role: 'Nurse',
                color: 'var(--role-nurse)',
                bg: 'var(--role-nurse-bg)',
                copy: 'Ward view, vitals logger, med pass.',
              },
              {
                role: 'Pharmacist',
                color: 'var(--role-pharmacist)',
                bg: 'var(--role-pharmacist-bg)',
                copy: 'Rx queue, interaction checks.',
              },
              {
                role: 'Patient',
                color: 'var(--role-patient)',
                bg: 'var(--role-patient-bg)',
                copy: 'Plain-language plan and reminders.',
              },
            ].map((r) => (
              <div
                key={r.role}
                style={{
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--r-lg)',
                  padding: 'var(--s-4)',
                  boxShadow: 'var(--shadow-card)',
                  borderTop: `2px solid ${r.color}`,
                }}
              >
                <span
                  className="micro"
                  style={{
                    color: r.color,
                    background: r.bg,
                    padding: '2px 8px',
                    borderRadius: 'var(--r-pill)',
                  }}
                >
                  {r.role}
                </span>
                <p className="small" style={{ marginTop: 'var(--s-2)', color: 'var(--fg2)' }}>
                  {r.copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer
        className="caption flex items-center justify-between px-6"
        style={{ height: 48, borderTop: '1px solid var(--border)', color: 'var(--fg3)' }}
      >
        <span>CareMind &copy; 2026</span>
        <span className="mono" style={{ fontSize: 11 }}>
          v0.1.0
        </span>
      </footer>
    </main>
  );
}
