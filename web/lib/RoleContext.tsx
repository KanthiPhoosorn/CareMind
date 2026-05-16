'use client';

// Real RoleContext backed by the signed-in user's profile row. Middleware
// guarantees an authenticated session for any route that mounts the dashboard
// layout, so the loading window here is short — just the round trip to
// auth.getUser() + select from profiles.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type StaffRole = 'doctor' | 'nurse' | 'pharmacist' | 'patient';

interface RoleContextType {
  role: StaffRole;
  hospitalId: string | null;
  displayName: string;
  email: string;
  loading: boolean;
  // Kept as `string` for compatibility with the existing Header role-switcher
  // <select> that still exists in patient/pharmacy pages. Runtime values are
  // narrowed back to StaffRole via the union cast in the consumer.
  setRole: (role: string) => void;
}

interface ProfileRow {
  role: StaffRole;
  hospital_id: string | null;
  full_name: string | null;
  email: string | null;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleInternal] = useState<StaffRole>('doctor');
  const setRole = (next: string) => setRoleInternal(next as StaffRole);
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      // Cast to `any` once at the query boundary: our handwritten Database
      // type can't satisfy Supabase's GenericSchema constraint, which makes
      // .from('profiles').select(...) collapse to `never`. ProfileRow below
      // is the real shape we expect back.
      const { data } = await (
        supabase as unknown as {
          from: (table: string) => {
            select: (cols: string) => {
              eq: (col: string, val: string) => { single: () => Promise<{ data: unknown }> };
            };
          };
        }
      )
        .from('profiles')
        .select('role, hospital_id, full_name, email')
        .eq('id', user.id)
        .single();
      const profile = data as ProfileRow | null;
      if (cancelled) return;
      if (profile) {
        setRoleInternal(profile.role);
        setHospitalId(profile.hospital_id ?? null);
        setDisplayName(profile.full_name ?? user.email ?? '');
        setEmail(profile.email ?? user.email ?? '');
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RoleContext.Provider value={{ role, hospitalId, displayName, email, loading, setRole }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
