// Department lookups for the staff queue dashboard. Always scoped to the
// caller's hospital via RLS (current_hospital_id() narrows the select to the
// staff user's row in profiles).
import { dbFrom } from '@/lib/supabase/server';

export interface Department {
  id: string;
  code: string;
  name_th: string;
  name_en: string;
}

type AnyClient = { from: (table: string) => unknown };

export async function listDepartments(supabase: AnyClient): Promise<Department[]> {
  const { data, error } = await dbFrom(supabase, 'departments')
    .select('id, code, name_th, name_en')
    .eq('is_active', true)
    .order('code');

  if (error) throw new Error(error.message);
  return (data ?? []) as Department[];
}

export async function findDepartmentByCode(
  supabase: AnyClient,
  code: string,
): Promise<Department | null> {
  const { data, error } = await dbFrom(supabase, 'departments')
    .select('id, code, name_th, name_en')
    .eq('code', code)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Department | null) ?? null;
}
