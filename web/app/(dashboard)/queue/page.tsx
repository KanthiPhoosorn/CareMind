// M2 staff dashboard: department selector for the walk-in queue.
// Each card links to /queue/[departmentCode] which renders the live queue board.
import Link from 'next/link';
import { MOCK_DEPARTMENTS } from '@/lib/mock-queue-data';

export default function QueueIndexPage() {
  return (
    <div style={{ padding: '32px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Walk-in Queue</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--fg3)', font: '400 14px/1.5 var(--font-ui)' }}>
          Select a department to manage its queue
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))', gap: 12, maxWidth: 800 }}>
        {MOCK_DEPARTMENTS.map(dept => (
          <Link key={dept.code} href={`/queue/${dept.code}`} style={{ textDecoration: 'none' }}>
            <div style={{ padding: '20px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-card)', cursor: 'pointer' }}>
              <div style={{ font: '700 11px/1.2 var(--font-ui)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand-primary)', marginBottom: 6 }}>
                {dept.code}
              </div>
              <div style={{ font: '600 14px/1.3 var(--font-ui)', color: 'var(--fg1)' }}>{dept.nameEn}</div>
              <div style={{ font: '400 12px/1.3 var(--font-ui)', color: 'var(--fg3)', marginTop: 2 }}>{dept.nameTh}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
