'use client';

// Staff sign-in page. Patient flow under (checkin) is anonymous; this page is
// only for clinical users who need to act on the queue board (call next, mark
// done, mark no-show). Successful sign-in routes to ?next or /queue.
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/queue';

  const [email, setEmail] = useState('staff@demo.caremind.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    router.replace(nextPath);
    router.refresh();
  };

  const inputStyle: React.CSSProperties = {
    padding: '14px 16px',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--r-md)',
    background: 'var(--bg-surface)',
    color: 'var(--fg1)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    font: '400 15px/1 var(--font-ui)',
  };

  const primaryBtn: React.CSSProperties = {
    padding: '14px',
    background: 'var(--brand-primary)',
    color: '#fff',
    border: 0,
    borderRadius: 'var(--r-lg)',
    font: '600 15px/1 var(--font-ui)',
    cursor: 'pointer',
  };

  const disabledBtn: React.CSSProperties = {
    ...primaryBtn,
    background: 'var(--fg4)',
    cursor: 'default',
  };
  const isDisabled = loading || !email || !password;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--bg-app)',
      }}
    >
      <div
        style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}
      >
        <div>
          <div
            style={{
              font: '700 24px/1.2 var(--font-ui)',
              letterSpacing: '-0.01em',
              color: 'var(--fg1)',
            }}
          >
            Staff sign in
          </div>
          <div style={{ font: '400 14px/1.5 var(--font-ui)', color: 'var(--fg3)', marginTop: 4 }}>
            ลงชื่อเข้าใช้สำหรับเจ้าหน้าที่
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@hospital.example"
            autoComplete="email"
            required
            style={inputStyle}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            required
            style={inputStyle}
          />
          {error && (
            <div style={{ font: '400 13px/1.4 var(--font-ui)', color: 'var(--sev-critical)' }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={isDisabled} style={isDisabled ? disabledBtn : primaryBtn}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div
          style={{
            padding: '12px 14px',
            background: 'var(--sev-info-bg)',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--r-md)',
            font: '400 12px/1.5 var(--font-ui)',
            color: 'var(--fg3)',
          }}
        >
          Dev credentials: <strong>staff@demo.caremind.local</strong> /{' '}
          <strong>caremind-dev</strong>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
