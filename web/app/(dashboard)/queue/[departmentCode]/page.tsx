// M3b staff dashboard: per-department queue board, real data.
// We resolve the dept by code (scoped to the staff's hospital via RLS),
// 404 if it doesn't exist, then prefetch active tickets and hand both to
// WalkinQueueBoard. The board owns optimistic state + Realtime subscription.
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { findDepartmentByCode } from '@/lib/queries/departments';
import { listActiveTickets } from '@/lib/queries/queue-tickets';
import { WalkinQueueBoard } from '@/components/ui/WalkinQueueBoard';

interface Props {
  params: Promise<{ departmentCode: string }>;
}

export default async function QueueDeptPage({ params }: Props) {
  const { departmentCode } = await params;
  const supabase = await createClient();
  const dept = await findDepartmentByCode(supabase, departmentCode);
  if (!dept) notFound();

  const tickets = await listActiveTickets(supabase, dept.id);

  return <WalkinQueueBoard department={dept} initialTickets={tickets} />;
}
