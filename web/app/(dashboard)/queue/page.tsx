// M3b staff dashboard: department selector for the walk-in queue.
// Fetches the caller's hospital departments via RLS (current_hospital_id())
// and renders a card grid. A separate "Triage" card sits above the grid
// because triage is its own workflow (assigns severity, doesn't pick next).
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listDepartments } from '@/lib/queries/departments';
import { dbFrom } from '@/lib/supabase/server';

export default async function QueueIndexPage() {
  const supabase = await createClient();
  const departments = await listDepartments(supabase);

  // Count pending_triage tickets so the Triage card can show a badge.
  const { data: pendingRows } = await dbFrom(supabase, 'queue_tickets')
    .select('id')
    .eq('state', 'pending_triage');
  const pendingTriageCount = Array.isArray(pendingRows) ? pendingRows.length : 0;

  return (
    <div style={{ padding: '32px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Walk-in Queue</h1>
        <p
          style={{
            margin: '4px 0 0',
            color: 'var(--fg3)',
            font: '400 14px/1.5 var(--font-ui)',
          }}
        >
          Select a department to manage its queue
        </p>
      </div>

      <Link href="/queue/triage" style={{ textDecoration: 'none' }}>
        <div
          style={{
            padding: '20px 24px',
            marginBottom: 24,
            background: 'linear-gradient(135deg, var(--sev-warning-bg), var(--bg-surface))',
            border: '1px solid var(--sev-warning)',
            borderRadius: 'var(--r-lg)',
            boxShadow: 'var(--shadow-card)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            maxWidth: 800,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--sev-warning)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              font: '700 18px/1 var(--font-ui)',
            }}
          >
            T
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ font: '600 16px/1.2 var(--font-ui)', color: 'var(--fg1)' }}>
              Triage · จุดคัดกรอง
            </div>
            <div style={{ font: '400 13px/1.4 var(--font-ui)', color: 'var(--fg3)', marginTop: 2 }}>
              Assign severity to new arrivals before they enter the OPD queue
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ font: '700 28px/1 var(--font-ui)', color: 'var(--sev-warning)' }}>
              {pendingTriageCount}
            </div>
            <div style={{ font: '400 11px/1 var(--font-ui)', color: 'var(--fg3)' }}>waiting</div>
          </div>
        </div>
      </Link>

      {departments.length === 0 ? (
        <div
          style={{
            padding: '32px 24px',
            background: 'var(--bg-surface)',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--r-lg)',
            color: 'var(--fg3)',
            font: '400 14px/1.5 var(--font-ui)',
            maxWidth: 480,
          }}
        >
          No active departments configured for your hospital. Ask an admin to seed routing rules
          before walk-in patients can check in.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))',
            gap: 12,
            maxWidth: 800,
          }}
        >
          {departments.map((dept) => (
            <Link key={dept.code} href={`/queue/${dept.code}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  padding: '20px 16px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-lg)',
                  boxShadow: 'var(--shadow-card)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    font: '700 11px/1.2 var(--font-ui)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--brand-primary)',
                    marginBottom: 6,
                  }}
                >
                  {dept.code}
                </div>
                <div style={{ font: '600 14px/1.3 var(--font-ui)', color: 'var(--fg1)' }}>
                  {dept.name_en}
                </div>
                <div
                  style={{
                    font: '400 12px/1.3 var(--font-ui)',
                    color: 'var(--fg3)',
                    marginTop: 2,
                  }}
                >
                  {dept.name_th}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
