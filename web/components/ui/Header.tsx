'use client';

import { Search, Bell } from 'lucide-react';
import { ROLE_COLOR } from '@/lib/mock-data';

interface HeaderProps {
  role: string;
  setRole?: (role: string) => void;
  title: string;
  sub?: string;
}

export function Header({ role, setRole, title, sub }: HeaderProps) {
  const c = ROLE_COLOR[role] || ROLE_COLOR['doctor'];

  return (
    <header style={{ height: 56, borderBottom: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ font: '600 14px/1 var(--font-ui)' }}>{title}</div>
        {sub && <div style={{ font: '500 12px/1 var(--font-ui)', color: 'var(--fg3)', marginTop: 4 }}>{sub}</div>}
      </div>
      <div style={{ position: 'relative' }}>
        <Search style={{ width: 14, height: 14, color: 'var(--fg3)', position: 'absolute', left: 10, top: 9 }} />
        <input placeholder="Search patients, AN…" style={{ font: '400 13px/1 var(--font-ui)', padding: '8px 10px 8px 30px', borderRadius: 6, border: '1px solid var(--border-strong)', width: 240 }}/>
      </div>
      <button style={{ width: 32, height: 32, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--fg2)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
        <Bell style={{ width: 16, height: 16 }} />
      </button>
      {setRole && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px 4px 10px', borderRadius: 6, background: 'var(--bg-sunken)' }}>
          <span style={{ font: '500 11px/1 var(--font-ui)', color: 'var(--fg3)' }}>Sign in as</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}
            style={{ border: 0, background: 'transparent', font: '600 12px/1 var(--font-ui)', color: c, cursor: 'pointer', outline: 'none' }}>
            <option value="doctor">Doctor</option>
            <option value="nurse">Nurse</option>
            <option value="pharmacist">Pharmacist</option>
          </select>
        </div>
      )}
    </header>
  );
}
