'use client';

// Step 3 of the check-in flow: phone number → OTP → ticket created.
// Two-step form: first we call createTicket (which issues the ticket and sends OTP),
// then we verify the OTP. On success the full ticket data is stored in localStorage
// so the ticket page can display it without an auth session.
// The raw OTP is shown in a dev banner until SMS delivery lands in M4.
import { Suspense, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { createTicket, verifyOtp } from '../../actions';

type Step = 'phone' | 'otp';

function VerifyContent() {
  const router = useRouter();
  const { hospitalCode } = useParams<{ hospitalCode: string }>();
  const searchParams = useSearchParams();
  const symptom = searchParams.get('symptom') ?? 'other';
  const severity = searchParams.get('severity') ?? 'mild';

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const ticket = await createTicket(hospitalCode, symptom, severity, phone);
      localStorage.setItem(
        `ticket:${ticket.ticket_id}`,
        JSON.stringify({
          ticketNumber: ticket.ticket_number,
          departmentCode: ticket.department_code,
          departmentNameTh: ticket.department_name_th,
          departmentNameEn: ticket.department_name_en,
          positionInQueue: ticket.position_in_queue,
          patientToken: ticket.patient_token,
        }),
      );
      setTicketId(ticket.ticket_id);
      setDevOtp(ticket.otp_code); // dev only — goes to SMS in production (M4)
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const ok = await verifyOtp(ticketId, otp);
      if (ok) {
        router.push(`/${hospitalCode}/ticket/${ticketId}`);
      } else {
        setError('Invalid or expired OTP. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
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

  const disabledBtn: React.CSSProperties = { ...primaryBtn, background: 'var(--fg4)', cursor: 'default' };

  return (
    <div style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {step === 'phone' ? (
        <>
          <div>
            <div style={{ font: '700 22px/1.2 var(--font-ui)', letterSpacing: '-0.01em', color: 'var(--fg1)' }}>
              Enter your phone number
            </div>
            <div style={{ font: '400 14px/1.5 var(--font-ui)', color: 'var(--fg3)', marginTop: 4 }}>
              เราจะส่งรหัส OTP ไปยังเบอร์ของคุณ
            </div>
          </div>
          <form onSubmit={handlePhoneSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+66 8X XXX XXXX"
              required
              style={{ ...inputStyle, font: '400 16px/1 var(--font-ui)' }}
            />
            {error && (
              <div style={{ font: '400 13px/1.4 var(--font-ui)', color: 'var(--sev-critical)' }}>{error}</div>
            )}
            <button type="submit" disabled={loading || !phone} style={loading || !phone ? disabledBtn : primaryBtn}>
              {loading ? 'Sending OTP…' : 'Send OTP'}
            </button>
          </form>
        </>
      ) : (
        <>
          <div>
            <div style={{ font: '700 22px/1.2 var(--font-ui)', letterSpacing: '-0.01em', color: 'var(--fg1)' }}>
              Enter the OTP
            </div>
            <div style={{ font: '400 14px/1.5 var(--font-ui)', color: 'var(--fg3)', marginTop: 4 }}>
              กรอกรหัส 6 หลักที่ส่งไปยัง {phone}
            </div>
            {devOtp && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--sev-warning-bg)', border: '1px solid #f59e0b66', borderRadius: 'var(--r-md)', font: '500 12px/1.4 var(--font-ui)', color: 'var(--fg2)' }}>
                Dev mode — OTP:{' '}
                <span style={{ font: '700 14px/1 var(--font-mono)', letterSpacing: '0.12em' }}>{devOtp}</span>
              </div>
            )}
          </div>
          <form onSubmit={handleOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              required
              style={{ ...inputStyle, font: '700 28px/1 var(--font-mono)', letterSpacing: '0.2em', textAlign: 'center' }}
            />
            {error && (
              <div style={{ font: '400 13px/1.4 var(--font-ui)', color: 'var(--sev-critical)' }}>{error}</div>
            )}
            <button type="submit" disabled={loading || otp.length < 6} style={loading || otp.length < 6 ? disabledBtn : primaryBtn}>
              {loading ? 'Verifying…' : 'Verify & get ticket'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
              style={{ padding: '10px', background: 'none', border: 0, font: '400 13px/1 var(--font-ui)', color: 'var(--fg3)', cursor: 'pointer' }}
            >
              ← Change phone number
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyContent />
    </Suspense>
  );
}
