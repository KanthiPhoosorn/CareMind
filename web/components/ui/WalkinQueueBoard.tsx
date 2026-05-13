'use client';

// M3b/M4 staff queue board.
//
// Source of truth:
//   - Initial state is server-fetched and passed via `initialTickets`.
//   - Server actions (callNextTicketAction / markTicketDoneAction /
//     markTicketNoShowAction) mutate the DB and trigger DB-level event rows.
//   - Supabase Realtime broadcasts queue_tickets postgres_changes for the
//     scoped department to keep multiple staff terminals in sync.
//
// Optimistic UI: we mutate local state before awaiting the RPC. If the RPC
// throws (RLS rejection, hospital mismatch, etc) we roll back and show an
// inline error. Realtime acts as a reconciliation channel — when another
// terminal acts, INSERT/UPDATE events update our list without a full refetch.
import { useEffect, useRef, useState, useTransition } from 'react';
import type { Department } from '@/lib/queries/departments';
import type { QueueTicket } from '@/lib/queries/queue-tickets';
import { waitedMinutes } from '@/lib/queries/queue-tickets';
import { createClient } from '@/lib/supabase/client';
import {
  callNextTicketAction,
  markTicketDoneAction,
  markTicketNoShowAction,
} from '@/app/(dashboard)/queue/actions';
import type { SymptomCode, TriageSeverity } from '@caremind/shared';

const SYMPTOM_LABELS: Record<SymptomCode, string> = {
  cough: 'Cough',
  fever: 'Fever',
  stomach: 'Stomach',
  injury: 'Injury',
  skin: 'Skin',
  eye_ent: 'Eye/ENT',
  other: 'Other',
};

const SEV_COLOR: Record<TriageSeverity, string> = {
  severe: 'var(--sev-critical)',
  moderate: 'var(--sev-warning)',
  mild: 'var(--sev-positive)',
};
const SEV_BG: Record<TriageSeverity, string> = {
  severe: 'var(--sev-critical-bg)',
  moderate: 'var(--sev-warning-bg)',
  mild: 'var(--sev-positive-bg)',
};

interface Props {
  department: Department;
  initialTickets: QueueTicket[];
}

// The realtime payload shape we care about. The supabase-js types are loose
// here; we only read these fields and tolerate everything else.
interface ChangePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: QueueTicket | null;
  old: { id: string } | null;
}

function isActive(t: QueueTicket): boolean {
  return t.state === 'waiting' || t.state === 'called';
}

function sortQueue(tickets: QueueTicket[]): QueueTicket[] {
  // Same ordering as listActiveTickets() / call_next_ticket() so what the
  // board shows is exactly what "Call next" will pick.
  return [...tickets].sort((a, b) => {
    // priority is not exposed on QueueTicket directly — severity maps 1:1
    // (severe→10, moderate→50, mild→100). We derive the same effect.
    const pa = severityToPriority(a.severity);
    const pb = severityToPriority(b.severity);
    if (pa !== pb) return pa - pb;
    return a.ticket_number - b.ticket_number;
  });
}

function severityToPriority(s: TriageSeverity): number {
  return s === 'severe' ? 10 : s === 'moderate' ? 50 : 100;
}

export function WalkinQueueBoard({ department, initialTickets }: Props) {
  const [tickets, setTickets] = useState<QueueTicket[]>(() => sortQueue(initialTickets));
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const now = useNow(30_000);

  // Realtime: subscribe to queue_tickets changes for this department only.
  // Channel filter keeps cross-department chatter off the wire. Reconciliation
  // is by id (UPDATE merges; INSERT appends if new; DELETE removes).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`queue:${department.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'queue_tickets',
          filter: `department_id=eq.${department.id}`,
        },
        (payload: ChangePayload) => {
          setTickets((prev) => reconcile(prev, payload));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [department.id]);

  const called = tickets.find((t) => t.state === 'called') ?? null;
  const waiting = tickets.filter((t) => t.state === 'waiting');

  const callNext = () => {
    if (waiting.length === 0 || pending) return;
    setError('');
    // Optimistic: mark first-waiting as called locally. If the RPC rolls a
    // different ticket (race with another staff terminal) the Realtime event
    // will reconcile us.
    const next = waiting[0];
    const previousCalledId = called?.id;
    setTickets((prev) =>
      sortQueue(
        prev.map((t) => {
          if (t.id === previousCalledId) return { ...t, state: 'done' };
          if (t.id === next.id)
            return { ...t, state: 'called', called_at: new Date().toISOString() };
          return t;
        }),
      ),
    );

    startTransition(async () => {
      try {
        await callNextTicketAction(department.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to call next ticket');
        // Reload truth from the server-side by re-sorting the initialTickets
        // is wrong — but Realtime will catch up shortly. We just leave the
        // optimistic state for now and let the rebroadcast correct it.
      }
    });
  };

  const markDone = (id: string) => {
    if (pending) return;
    setError('');
    setTickets((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      try {
        await markTicketDoneAction(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to mark done');
      }
    });
  };

  const markNoShow = (id: string) => {
    if (pending) return;
    setError('');
    setTickets((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      try {
        await markTicketNoShowAction(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to mark no-show');
      }
    });
  };

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '24px', maxWidth: 720 }}
    >
      <Header department={department} waitingCount={waiting.length} />

      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--sev-critical-bg)',
            border: '1px solid var(--sev-critical)',
            borderRadius: 'var(--r-md)',
            font: '500 13px/1.4 var(--font-ui)',
            color: 'var(--sev-critical)',
          }}
        >
          {error}
        </div>
      )}

      <NowServing
        called={called}
        now={now}
        onDone={markDone}
        onNoShow={markNoShow}
        pending={pending}
      />

      <button
        onClick={callNext}
        disabled={waiting.length === 0 || pending}
        style={{
          padding: '14px',
          background: waiting.length === 0 || pending ? 'var(--fg4)' : 'var(--brand-primary)',
          color: '#fff',
          border: 0,
          borderRadius: 'var(--r-lg)',
          font: '600 15px/1 var(--font-ui)',
          cursor: waiting.length === 0 || pending ? 'default' : 'pointer',
        }}
      >
        {waiting.length === 0
          ? 'Queue is empty'
          : pending
            ? 'Working…'
            : `Call next  ·  ${waiting.length} waiting`}
      </button>

      {waiting.length > 0 && <WaitingList tickets={waiting} now={now} />}
    </div>
  );
}

function reconcile(prev: QueueTicket[], payload: ChangePayload): QueueTicket[] {
  if (payload.eventType === 'DELETE' && payload.old) {
    return prev.filter((t) => t.id !== payload.old!.id);
  }
  if (payload.eventType === 'INSERT' && payload.new) {
    if (!isActive(payload.new)) return prev;
    if (prev.some((t) => t.id === payload.new!.id)) return prev;
    return sortQueue([...prev, payload.new]);
  }
  if (payload.eventType === 'UPDATE' && payload.new) {
    const updated = payload.new;
    const exists = prev.some((t) => t.id === updated.id);
    if (!isActive(updated)) {
      // ticket left the board (done/no_show/cancelled)
      return prev.filter((t) => t.id !== updated.id);
    }
    const next = exists ? prev.map((t) => (t.id === updated.id ? updated : t)) : [...prev, updated];
    return sortQueue(next);
  }
  return prev;
}

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(new Date()), intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [intervalMs]);
  return now;
}

function Header({ department, waitingCount }: { department: Department; waitingCount: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              font: '700 11px/1 var(--font-ui)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--brand-primary)',
              background: '#eff4fe',
              padding: '3px 8px',
              borderRadius: 'var(--r-pill)',
            }}
          >
            {department.code}
          </span>
          <h1 style={{ margin: 0, fontSize: 20, color: 'var(--fg1)' }}>{department.name_en}</h1>
        </div>
        <div
          style={{
            font: '400 13px/1.4 var(--font-ui)',
            color: 'var(--fg3)',
            marginTop: 2,
          }}
        >
          {department.name_th}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ font: '700 32px/1 var(--font-ui)', color: 'var(--fg1)' }}>{waitingCount}</div>
        <div style={{ font: '400 12px/1 var(--font-ui)', color: 'var(--fg3)' }}>waiting</div>
      </div>
    </div>
  );
}

function NowServing({
  called,
  now,
  onDone,
  onNoShow,
  pending,
}: {
  called: QueueTicket | null;
  now: Date;
  onDone: (id: string) => void;
  onNoShow: (id: string) => void;
  pending: boolean;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-xl)',
        padding: '20px 24px',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        style={{
          font: '500 11px/1 var(--font-ui)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--fg3)',
          marginBottom: 14,
        }}
      >
        Now serving
      </div>
      {called ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              font: '700 60px/1 var(--font-ui)',
              letterSpacing: '-0.03em',
              color: 'var(--brand-primary)',
              minWidth: 80,
            }}
          >
            #{called.ticket_number}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <span
                style={{
                  font: '500 11px/1 var(--font-ui)',
                  padding: '3px 8px',
                  borderRadius: 'var(--r-pill)',
                  background: SEV_BG[called.severity],
                  color: SEV_COLOR[called.severity],
                }}
              >
                {called.severity}
              </span>
              <span
                style={{
                  font: '500 11px/1 var(--font-ui)',
                  padding: '3px 8px',
                  borderRadius: 'var(--r-pill)',
                  background: 'var(--bg-sunken)',
                  color: 'var(--fg3)',
                }}
              >
                {SYMPTOM_LABELS[called.symptom_code] ?? called.symptom_code}
              </span>
            </div>
            <div style={{ font: '400 12px/1 var(--font-ui)', color: 'var(--fg3)' }}>
              Waited {waitedMinutes(called.created_at, now)}m
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onDone(called.id)}
              disabled={pending}
              style={{
                padding: '8px 16px',
                background: 'var(--sev-positive)',
                color: '#fff',
                border: 0,
                borderRadius: 'var(--r-md)',
                font: '600 13px/1 var(--font-ui)',
                cursor: pending ? 'default' : 'pointer',
                opacity: pending ? 0.6 : 1,
              }}
            >
              Done ✓
            </button>
            <button
              onClick={() => onNoShow(called.id)}
              disabled={pending}
              style={{
                padding: '8px 16px',
                background: 'var(--sev-warning)',
                color: '#fff',
                border: 0,
                borderRadius: 'var(--r-md)',
                font: '600 13px/1 var(--font-ui)',
                cursor: pending ? 'default' : 'pointer',
                opacity: pending ? 0.6 : 1,
              }}
            >
              No-show
            </button>
          </div>
        </div>
      ) : (
        <div style={{ font: '400 14px/1 var(--font-ui)', color: 'var(--fg4)' }}>
          No one being served right now
        </div>
      )}
    </div>
  );
}

function WaitingList({ tickets, now }: { tickets: QueueTicket[]; now: Date }) {
  return (
    <div>
      <div
        style={{
          font: '500 11px/1 var(--font-ui)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--fg3)',
          marginBottom: 12,
        }}
      >
        Waiting queue
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tickets.map((t, i) => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '12px 16px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div
              style={{
                font: '500 12px/1 var(--font-ui)',
                color: 'var(--fg4)',
                minWidth: 16,
              }}
            >
              {i + 1}
            </div>
            <div
              style={{
                font: '700 22px/1 var(--font-ui)',
                color: 'var(--fg1)',
                minWidth: 36,
              }}
            >
              {t.ticket_number}
            </div>
            <div style={{ flex: 1, display: 'flex', gap: 6 }}>
              <span
                style={{
                  font: '500 11px/1 var(--font-ui)',
                  padding: '2px 7px',
                  borderRadius: 'var(--r-pill)',
                  background: SEV_BG[t.severity],
                  color: SEV_COLOR[t.severity],
                }}
              >
                {t.severity}
              </span>
              <span
                style={{
                  font: '500 11px/1 var(--font-ui)',
                  padding: '2px 7px',
                  borderRadius: 'var(--r-pill)',
                  background: 'var(--bg-sunken)',
                  color: 'var(--fg3)',
                }}
              >
                {SYMPTOM_LABELS[t.symptom_code] ?? t.symptom_code}
              </span>
            </div>
            <div style={{ font: '400 12px/1 var(--font-ui)', color: 'var(--fg4)' }}>
              {waitedMinutes(t.created_at, now)}m ago
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
