// Wait-time + per-department stats helpers, backed by migration 00010.
//
// - estimateWaitMinutes() wraps the estimate_wait_minutes() SQL function so
//   patient pages can show "≈ 25 minutes" alongside their queue position.
// - departmentStatsToday() reads the queue_dept_stats_today view for the
//   staff dashboard banner.
import { callRpc, dbFrom } from '@/lib/supabase/server';
import type { createClient } from '@/lib/supabase/server';

type SbClient = Awaited<ReturnType<typeof createClient>>;
type AnyClient = { from: (table: string) => unknown };

export async function estimateWaitMinutes(
  supabase: SbClient,
  departmentId: string,
  position: number,
): Promise<number> {
  const { data, error } = await callRpc(supabase, 'estimate_wait_minutes', {
    p_department_id: departmentId,
    p_position: position,
  });
  if (error) return 0;
  // Function returns INTEGER; callRpc preserves the scalar type.
  return typeof data === 'number' ? data : 0;
}

export interface DepartmentStats {
  department_id: string;
  department_code: string;
  calls_done_today: number;
  no_shows_today: number;
  waiting_now: number;
  avg_wait_minutes_today: number | null;
}

export async function departmentStatsToday(
  supabase: AnyClient,
  departmentId: string,
): Promise<DepartmentStats | null> {
  const { data, error } = await dbFrom(supabase, 'queue_dept_stats_today')
    .select(
      'department_id, department_code, calls_done_today, no_shows_today, waiting_now, avg_wait_minutes_today',
    )
    .eq('department_id', departmentId)
    .maybeSingle();
  if (error) return null;
  return (data as DepartmentStats | null) ?? null;
}
