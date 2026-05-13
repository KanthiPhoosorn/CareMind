'use client';

// ListOrdered was added in M2 for the Walk-in Queue nav item.
import {
  Users,
  ClipboardList,
  Sparkles,
  FileText,
  Pill,
  AlertTriangle,
  ListOrdered,
  LogOut,
} from 'lucide-react';
import { useTransition } from 'react';
import { ROLE_COLOR, ROLE_BG } from '@/lib/mock-data';
import { useRole } from '@/lib/RoleContext';
import { logoutAction } from '@/app/login/actions';

interface SidebarProps {
  role: string;
  view: string;
  setView: (view: string) => void;
}

export function Sidebar({ role, view, setView }: SidebarProps) {
  const c = ROLE_COLOR[role] || ROLE_COLOR['doctor'];
  const { displayName, email } = useRole();
  const [signingOut, startSignOut] = useTransition();
  const initials = (displayName || email || '?')
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const iconMap: Record<string, any> = {
    users: Users,
    'clipboard-list': ClipboardList,
    sparkles: Sparkles,
    'file-text': FileText,
    pill: Pill,
    'alert-triangle': AlertTriangle,
    'list-ordered': ListOrdered,
  };

  const items =
    role === 'pharmacist'
      ? [
          ['queue', 'pill', 'Rx Queue'],
          ['patients', 'users', 'Patients'],
          ['interactions', 'alert-triangle', 'Interactions'],
        ]
      : [
          ['patients', 'users', 'Patients'],
          ['walkin', 'list-ordered', 'Walk-in Queue'],
          ['triage', 'alert-triangle', 'Triage'],
          ['rounds', 'clipboard-list', 'My rounds'],
          ['ai', 'sparkles', 'AI consult'],
          ['orders', 'file-text', 'Orders'],
        ];

  return (
    <aside
      style={{
        width: 224,
        background: '#fff',
        borderRight: '1px solid var(--border)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: c,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <svg viewBox="0 0 64 64" width="20" height="20">
            <path
              d="M8 34 L18 34 L22 22 L30 46 L36 30 L40 38 L46 34 L56 34"
              fill="none"
              stroke="#fff"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span style={{ font: '700 15px/1 var(--font-ui)', letterSpacing: '-0.01em' }}>
          CareMind
        </span>
      </div>
      <nav style={{ padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(([k, ic, label]) => {
          const active = view === k;
          const IconComponent = iconMap[ic];
          return (
            <button
              key={k}
              onClick={() => setView(k)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                border: 0,
                background: active ? ROLE_BG[role] : 'transparent',
                color: active ? c : 'var(--fg2)',
                borderRadius: 6,
                font: '500 13px/1 var(--font-ui)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <IconComponent style={{ width: 16, height: 16 }} />
              {label}
            </button>
          );
        })}
      </nav>
      <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid var(--divider)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: c,
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              font: '600 12px/1 var(--font-ui)',
            }}
          >
            {initials || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                font: '600 12px/1.2 var(--font-ui)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {displayName || email || 'Signed in'}
            </div>
            <div
              style={{
                font: '500 11px/1.2 var(--font-ui)',
                color: 'var(--fg3)',
                marginTop: 2,
                textTransform: 'capitalize',
              }}
            >
              {role}
            </div>
          </div>
          <button
            onClick={() => startSignOut(() => logoutAction())}
            disabled={signingOut}
            title="Sign out"
            aria-label="Sign out"
            style={{
              padding: 6,
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: signingOut ? 'default' : 'pointer',
              color: 'var(--fg3)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <LogOut style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>
    </aside>
  );
}
