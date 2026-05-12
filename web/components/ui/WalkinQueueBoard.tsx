'use client';

// M2 staff queue board. State is managed optimistically client-side so the UI
// responds instantly without a full refetch after each action.
// All three action handlers are stubs — replace with callRpc() once staff auth
// is wired (Sprint 1). The called ticket is removed (not transitioned to 'done')
// on callNext because MockTicket.state only has 'waiting' | 'called'.
import { useState } from 'react';
import type { MockDepartment, MockTicket } from '@/lib/mock-queue-data';

const SYMPTOM_LABELS: Record<string, string> = {
  cough: 'Cough', fever: 'Fever', stomach: 'Stomach',
  injury: 'Injury', skin: 'Skin', eye_ent: 'Eye/ENT', other: 'Other',
};

const SEV_COLOR: Record<string, string> = {
  severe: 'var(--sev-critical)', moderate: 'var(--sev-warning)', mild: 'var(--sev-positive)',
};
const SEV_BG: Record<string, string> = {
  severe: 'var(--sev-critical-bg)', moderate: 'var(--sev-warning-bg)', mild: 'var(--sev-positive-bg)',
};

interface Props {
  department: MockDepartment;
  initialTickets: MockTicket[];
}

export function WalkinQueueBoard({ department, initialTickets }: Props) {
  const [tickets, setTickets] = useState<MockTicket[]>(initialTickets);

  const called = tickets.find(t => t.state === 'called') ?? null;
  const waiting = tickets.filter(t => t.state === 'waiting');

  const callNext = () => {
    // TODO: replace with supabase.rpc('call_next_ticket', { p_department_id: department.id })
    const next = waiting[0];
    if (!next) return;
    const calledId = called?.id;
    setTickets(prev =>
      prev
        .filter(t => t.id !== calledId)
        .map(t => t.id === next.id ? { ...t, state: 'called' as const } : t),
    );
  };

  const markDone = (id: string) => {
    // TODO: replace with supabase.rpc('mark_ticket_done', { p_ticket_id: id })
    setTickets(prev => prev.filter(t => t.id !== id));
  };

  const markNoShow = (id: string) => {
    // TODO: replace with supabase.rpc('mark_ticket_no_show', { p_ticket_id: id })
    setTickets(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px', maxWidth: 720 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ font: '700 11px/1 var(--font-ui)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand-primary)', background: '#eff4fe', padding: '3px 8px', borderRadius: 'var(--r-pill)' }}>
              {department.code}
            </span>
            <h1 style={{ margin: 0, fontSize: 20, color: 'var(--fg1)' }}>{department.nameEn}</h1>
          </div>
          <div style={{ font: '400 13px/1.4 var(--font-ui)', color: 'var(--fg3)', marginTop: 2 }}>{department.nameTh}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ font: '700 32px/1 var(--font-ui)', color: 'var(--fg1)' }}>{waiting.length}</div>
          <div style={{ font: '400 12px/1 var(--font-ui)', color: 'var(--fg3)' }}>waiting</div>
        </div>
      </div>

      {/* Now serving card */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '20px 24px', boxShadow: 'var(--shadow-card)' }}>
        <div style={{ font: '500 11px/1 var(--font-ui)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 14 }}>
          Now serving
        </div>
        {called ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ font: '700 60px/1 var(--font-ui)', letterSpacing: '-0.03em', color: 'var(--brand-primary)', minWidth: 80 }}>
              #{called.ticketNumber}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <span style={{ font: '500 11px/1 var(--font-ui)', padding: '3px 8px', borderRadius: 'var(--r-pill)', background: SEV_BG[called.severity], color: SEV_COLOR[called.severity] }}>
                  {called.severity}
                </span>
                <span style={{ font: '500 11px/1 var(--font-ui)', padding: '3px 8px', borderRadius: 'var(--r-pill)', background: 'var(--bg-sunken)', color: 'var(--fg3)' }}>
                  {SYMPTOM_LABELS[called.symptomCode] ?? called.symptomCode}
                </span>
              </div>
              <div style={{ font: '400 12px/1 var(--font-ui)', color: 'var(--fg3)' }}>Waited {called.waitedMinutes}m</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => markDone(called.id)}
                style={{ padding: '8px 16px', background: 'var(--sev-positive)', color: '#fff', border: 0, borderRadius: 'var(--r-md)', font: '600 13px/1 var(--font-ui)', cursor: 'pointer' }}
              >
                Done ✓
              </button>
              <button
                onClick={() => markNoShow(called.id)}
                style={{ padding: '8px 16px', background: 'var(--sev-warning)', color: '#fff', border: 0, borderRadius: 'var(--r-md)', font: '600 13px/1 var(--font-ui)', cursor: 'pointer' }}
              >
                No-show
              </button>
            </div>
          </div>
        ) : (
          <div style={{ font: '400 14px/1 var(--font-ui)', color: 'var(--fg4)' }}>No one being served right now</div>
        )}
      </div>

      {/* Call next button */}
      <button
        onClick={callNext}
        disabled={waiting.length === 0}
        style={{
          padding: '14px',
          background: waiting.length === 0 ? 'var(--fg4)' : 'var(--brand-primary)',
          color: '#fff',
          border: 0,
          borderRadius: 'var(--r-lg)',
          font: '600 15px/1 var(--font-ui)',
          cursor: waiting.length === 0 ? 'default' : 'pointer',
        }}
      >
        {waiting.length === 0 ? 'Queue is empty' : `Call next  ·  ${waiting.length} waiting`}
      </button>

      {/* Waiting list */}
      {waiting.length > 0 && (
        <div>
          <div style={{ font: '500 11px/1 var(--font-ui)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 12 }}>
            Waiting queue
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {waiting.map((t, i) => (
              <div
                key={t.id}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-card)' }}
              >
                <div style={{ font: '500 12px/1 var(--font-ui)', color: 'var(--fg4)', minWidth: 16 }}>
                  {i + 1}
                </div>
                <div style={{ font: '700 22px/1 var(--font-ui)', color: 'var(--fg1)', minWidth: 36 }}>
                  {t.ticketNumber}
                </div>
                <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                  <span style={{ font: '500 11px/1 var(--font-ui)', padding: '2px 7px', borderRadius: 'var(--r-pill)', background: SEV_BG[t.severity], color: SEV_COLOR[t.severity] }}>
                    {t.severity}
                  </span>
                  <span style={{ font: '500 11px/1 var(--font-ui)', padding: '2px 7px', borderRadius: 'var(--r-pill)', background: 'var(--bg-sunken)', color: 'var(--fg3)' }}>
                    {SYMPTOM_LABELS[t.symptomCode] ?? t.symptomCode}
                  </span>
                </div>
                <div style={{ font: '400 12px/1 var(--font-ui)', color: 'var(--fg4)' }}>{t.waitedMinutes}m ago</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
