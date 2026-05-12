// M2 staff dashboard: per-department queue board.
// initialTickets is passed as a prop so WalkinQueueBoard can manage
// optimistic state client-side without refetching on every action.
import { notFound } from 'next/navigation';
import { MOCK_DEPARTMENTS, getMockTickets } from '@/lib/mock-queue-data';
import { WalkinQueueBoard } from '@/components/ui/WalkinQueueBoard';

interface Props {
  params: Promise<{ departmentCode: string }>;
}

export default async function QueueDeptPage({ params }: Props) {
  const { departmentCode } = await params;
  const dept = MOCK_DEPARTMENTS.find(d => d.code === departmentCode);
  if (!dept) notFound();

  const tickets = getMockTickets(departmentCode);

  return <WalkinQueueBoard department={dept} initialTickets={tickets} />;
}
