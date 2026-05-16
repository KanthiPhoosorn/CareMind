'use client';

// Triage board: lets a clinician assign severity to each pending_triage
// ticket, which transitions it into the real OPD queue via the
// triage_walkin_ticket RPC. Realtime keeps the list in sync if multiple
// nurses work the same hospital.
import { useEffect, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { triageTicketAction } from '@/app/(dashboard)/queue/actions';
import type { TriageTicket } from '@/lib/queries/triage';
import type { SymptomCode } from '@caremind/shared';

const SYMPTOM_LABELS: Record<SymptomCode, { en: string; th: string }> = {
  cough: { en: 'Cough', th: 'ไอ' },
  fever: { en: 'Fever', th: 'ไข้' },
  stomach: { en: 'Stomach', th: 'ปวดท้อง' },
  injury: { en: 'Injury', th: 'บาดเจ็บ' },
  skin: { en: 'Skin', th: 'ผิวหนัง' },
  eye_ent: { en: 'Eye/ENT', th: 'ตา หู คอ' },
  other: { en: 'Other', th: 'อื่นๆ' },
};

interface ChangePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: TriageTicket | null;
  old: { id: string } | null;
}

interface Props {
  initialTickets: TriageTicket[];
}

export function TriageBoard({ initialTickets }: Props) {
  const [tickets, setTickets] = useState<TriageTicket[]>(initialTickets);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('triage:any')
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'queue_tickets' },
        (payload: ChangePayload) => {
          setTickets((prev) => {
            // INSERT: new pending_triage ticket
            if (
              payload.eventType === 'INSERT' &&
              payload.new &&
              payload.new.symptom_code !== undefined
            ) {
              // queue_tickets row from realtime may have full Row shape; only
              // include if the new row is pending_triage. The TriageTicket
              // type doesn't carry state but realtime payloads do — narrow.
              const row = payload.new as TriageTicket & { state?: string };
              if (row.state !== 'pending_triage') return prev;
              if (prev.some((t) => t.id === row.id)) return prev;
              return [...prev, row].sort((a, b) => a.ticket_number - b.ticket_number);
            }
            // UPDATE: ticket left pending_triage (triaged) → drop
            if (payload.eventType === 'UPDATE' && payload.new) {
              const row = payload.new as TriageTicket & { state?: string };
              if (row.state !== 'pending_triage') {
                return prev.filter((t) => t.id !== row.id);
              }
              return prev.map((t) => (t.id === row.id ? row : t));
            }
            // DELETE
            if (payload.eventType === 'DELETE' && payload.old) {
              return prev.filter((t) => t.id !== payload.old!.id);
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const assign = (id: string, severity: 'mild' | 'moderate' | 'severe') => {
    if (pending) return;
    setError('');
    setBusyId(id);
    // Optimistic: remove from triage list. If the RPC rejects, Realtime
    // will reinsert via the next INSERT/UPDATE event.
    setTickets((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      try {
        await triageTicketAction(id, severity);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Triage failed');
      } finally {
        setBusyId(null);
      }
    });
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: 720 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Triage</h1>
        <p
          style={{
            margin: '4px 0 0',
            color: 'var(--fg3)',
            font: '400 14px/1.5 var(--font-ui)',
          }}
        >
          Patients awaiting clinical severity assessment · ผู้ป่วยรอประเมินคัดกรอง
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            marginBottom: 16,
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

      {tickets.length === 0 ? (
        <div
          style={{
            padding: '40px 24px',
            background: 'var(--bg-surface)',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--r-lg)',
            color: 'var(--fg3)',
            font: '400 14px/1.5 var(--font-ui)',
            textAlign: 'center',
          }}
        >
          No patients waiting for triage. New check-ins will appear here automatically.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tickets.map((t) => {
            const sym = SYMPTOM_LABELS[t.symptom_code] ?? { en: t.symptom_code, th: '' };
            const isBusy = busyId === t.id;
            return (
              <div
                key={t.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 20px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-lg)',
                  boxShadow: 'var(--shadow-card)',
                  opacity: isBusy ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    font: '700 32px/1 var(--font-ui)',
                    color: 'var(--brand-primary)',
                    minWidth: 56,
                  }}
                >
                  #{t.ticket_number}
                </div>
                <div>
                  <div style={{ font: '600 15px/1.2 var(--font-ui)', color: 'var(--fg1)' }}>
                    {sym.en}
                  </div>
                  <div
                    style={{
                      font: '400 12px/1.3 var(--font-ui)',
                      color: 'var(--fg3)',
                      marginTop: 2,
                    }}
                  >
                    {sym.th} · {t.phone_e164}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <SeverityButton
                    label="Mild"
                    color="var(--sev-positive)"
                    onClick={() => assign(t.id, 'mild')}
                    disabled={isBusy}
                  />
                  <SeverityButton
                    label="Moderate"
                    color="var(--sev-warning)"
                    onClick={() => assign(t.id, 'moderate')}
                    disabled={isBusy}
                  />
                  <SeverityButton
                    label="Severe"
                    color="var(--sev-critical)"
                    onClick={() => assign(t.id, 'severe')}
                    disabled={isBusy}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SeverityButton({
  label,
  color,
  onClick,
  disabled,
}: {
  label: string;
  color: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 12px',
        background: color,
        color: '#fff',
        border: 0,
        borderRadius: 'var(--r-md)',
        font: '600 12px/1 var(--font-ui)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}
