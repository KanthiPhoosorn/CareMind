'use client';

// Step 4 (final) of the check-in flow: the patient's ticket confirmation page.
// Ticket data is read from localStorage (written in /verify) so this page works
// without an active session. patientToken is included so the cancel action can
// authenticate the request server-side via the cancel_walkin_ticket RPC.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { cancelTicket, getTicketWaitEstimate, type TicketWaitEstimate } from '../../../actions';

interface StoredTicket {
  ticketNumber: number;
  departmentCode: string;
  departmentNameTh: string;
  departmentNameEn: string;
  positionInQueue: number;
  patientToken: string;
}

export default function TicketPage() {
  const { hospitalCode, ticketId } = useParams<{ hospitalCode: string; ticketId: string }>();
  const [ticket, setTicket] = useState<StoredTicket | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [waitEstimate, setWaitEstimate] = useState<TicketWaitEstimate | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(`ticket:${ticketId}`);
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTicket(JSON.parse(stored));
    }
  }, [ticketId]);

  // Poll the wait estimate every 30s so the patient sees their position
  // drop as the queue moves. The RPC re-derives position server-side so it
  // stays correct even if our localStorage copy is stale.
  useEffect(() => {
    if (!ticket?.patientToken) return;
    let cancel = false;
    const refresh = async () => {
      const est = await getTicketWaitEstimate(ticketId, ticket.patientToken);
      if (!cancel && est) setWaitEstimate(est);
    };
    void refresh();
    const interval = setInterval(refresh, 30_000);
    return () => {
      cancel = true;
      clearInterval(interval);
    };
  }, [ticket?.patientToken, ticketId]);

  const handleCancel = async () => {
    if (!ticket || loading) return;
    setLoading(true);
    try {
      const ok = await cancelTicket(ticketId, ticket.patientToken);
      if (ok) {
        localStorage.removeItem(`ticket:${ticketId}`);
        setCancelled(true);
      }
    } finally {
      setLoading(false);
    }
  };

  if (cancelled) {
    return (
      <div
        style={{
          maxWidth: 400,
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          paddingTop: 32,
        }}
      >
        <div style={{ fontSize: 48 }}>✅</div>
        <div>
          <div style={{ font: '700 20px/1.2 var(--font-ui)', color: 'var(--fg1)' }}>
            Queue ticket cancelled
          </div>
          <div style={{ font: '400 14px/1.5 var(--font-ui)', color: 'var(--fg3)', marginTop: 4 }}>
            ยกเลิกคิวเรียบร้อยแล้ว
          </div>
        </div>
        <a
          href={`/${hospitalCode}`}
          style={{
            padding: '12px 24px',
            background: 'var(--brand-primary)',
            color: '#fff',
            borderRadius: 'var(--r-lg)',
            font: '500 14px/1 var(--font-ui)',
            textDecoration: 'none',
          }}
        >
          Get a new queue number
        </a>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center', paddingTop: 48 }}>
        <div style={{ font: '400 14px/1.5 var(--font-ui)', color: 'var(--fg3)' }}>
          Loading ticket…
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 400,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        paddingTop: 32,
      }}
    >
      <div
        style={{
          width: '100%',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--r-2xl)',
          boxShadow: 'var(--shadow-modal)',
          padding: '32px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
        }}
      >
        <div
          style={{
            font: '500 12px/1 var(--font-ui)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--fg3)',
          }}
        >
          Queue number · หมายเลขคิว
        </div>

        <div
          style={{
            font: '700 96px/1 var(--font-ui)',
            letterSpacing: '-0.04em',
            color: 'var(--brand-primary)',
          }}
        >
          {waitEstimate?.currentTicketNumber ?? ticket.ticketNumber}
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ font: '600 16px/1.2 var(--font-ui)', color: 'var(--fg1)' }}>
            {waitEstimate?.currentDepartmentNameEn ?? ticket.departmentNameEn}
          </div>
          <div style={{ font: '400 14px/1.4 var(--font-ui)', color: 'var(--fg3)', marginTop: 2 }}>
            {waitEstimate?.currentDepartmentNameTh ?? ticket.departmentNameTh}
          </div>
        </div>

        <div style={{ width: '100%', height: 1, background: 'var(--divider)' }} />

        <div style={{ textAlign: 'center' }}>
          <div style={{ font: '400 13px/1.5 var(--font-ui)', color: 'var(--fg3)' }}>
            Your position · ลำดับคิวของคุณ
          </div>
          <div style={{ font: '700 32px/1.1 var(--font-ui)', color: 'var(--fg1)', marginTop: 4 }}>
            #{waitEstimate?.positionInQueue ?? ticket.positionInQueue}
          </div>
          {waitEstimate &&
            waitEstimate.estimatedWaitMinutes > 0 &&
            waitEstimate.state === 'waiting' && (
              <div
                style={{
                  marginTop: 8,
                  font: '500 14px/1.4 var(--font-ui)',
                  color: 'var(--brand-primary)',
                }}
              >
                ≈ {waitEstimate.estimatedWaitMinutes} min wait
                <div style={{ font: '400 12px/1.3 var(--font-ui)', color: 'var(--fg3)' }}>
                  รอประมาณ {waitEstimate.estimatedWaitMinutes} นาที
                </div>
              </div>
            )}
          {waitEstimate?.state === 'called' && (
            <div
              style={{
                marginTop: 8,
                padding: '6px 12px',
                background: 'var(--sev-warning-bg)',
                borderRadius: 'var(--r-pill)',
                font: '600 13px/1.2 var(--font-ui)',
                color: 'var(--sev-warning)',
                display: 'inline-block',
              }}
            >
              Now serving · คิวของคุณแล้ว
            </div>
          )}
          {waitEstimate?.state === 'pending_triage' && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 14px',
                background: 'var(--sev-info-bg)',
                borderRadius: 'var(--r-pill)',
                font: '600 13px/1.2 var(--font-ui)',
                color: 'var(--brand-primary)',
                display: 'inline-block',
              }}
            >
              Waiting for triage · รอประเมินคัดกรอง
            </div>
          )}
        </div>

        <div
          style={{
            padding: '12px 16px',
            background: 'var(--sev-info-bg)',
            borderRadius: 'var(--r-lg)',
            font: '400 13px/1.5 var(--font-ui)',
            color: 'var(--fg2)',
            textAlign: 'center',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          We&apos;ll SMS you when your turn is nearly here. You don&apos;t need to stay in the
          waiting area.
          <div style={{ marginTop: 4, color: 'var(--fg3)', font: '400 12px/1.5 var(--font-ui)' }}>
            เราจะส่ง SMS แจ้งเตือนเมื่อใกล้ถึงคิวของคุณ
          </div>
        </div>
      </div>

      <button
        onClick={handleCancel}
        disabled={loading}
        style={{
          padding: '12px 24px',
          background: 'none',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r-lg)',
          font: '500 14px/1 var(--font-ui)',
          color: 'var(--fg3)',
          cursor: loading ? 'default' : 'pointer',
        }}
      >
        {loading ? 'Cancelling…' : 'Cancel my queue'}
      </button>
    </div>
  );
}
