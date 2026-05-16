// Staff triage view. Lists every pending_triage ticket for the caller's
// hospital and lets a nurse assign severity. Behind the scenes,
// triage_walkin_ticket() reroutes the ticket to its real OPD department and
// issues a fresh ticket_number scoped to that department.
import { createClient } from '@/lib/supabase/server';
import { listPendingTriageTickets } from '@/lib/queries/triage';
import { TriageBoard } from '@/components/ui/TriageBoard';

export default async function TriagePage() {
  const supabase = await createClient();
  const tickets = await listPendingTriageTickets(supabase);
  return <TriageBoard initialTickets={tickets} />;
}
