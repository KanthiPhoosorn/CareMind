// M3b staff dashboard: department selector for the walk-in queue.
// Fetches the caller's hospital departments via RLS (current_hospital_id())
// and renders a card grid. Each card links to /queue/[code].
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listDepartments } from '@/lib/queries/departments';

export default async function QueueIndexPage() {
  const supabase = await createClient();
  const departments = await listDepartments(supabase);

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
