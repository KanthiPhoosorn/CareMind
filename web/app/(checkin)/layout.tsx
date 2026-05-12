// Public layout for the patient walk-in check-in flow (M1).
// Intentionally stripped of dashboard nav — anonymous patients land here
// via QR code at the hospital entrance. No auth required.
import React from 'react';

export default function CheckinLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--brand-primary)', display: 'grid', placeItems: 'center' }}>
          <svg viewBox="0 0 64 64" width="20" height="20">
            <path d="M8 34 L18 34 L22 22 L30 46 L36 30 L40 38 L46 34 L56 34" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span style={{ font: '700 15px/1 var(--font-ui)', letterSpacing: '-0.01em' }}>CareMind</span>
      </header>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px' }}>
        {children}
      </main>
    </div>
  );
}
