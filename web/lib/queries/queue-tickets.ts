// Active queue ticket lookup for the staff dashboard. Mirrors the ordering
// inside call_next_ticket() so what the board shows is exactly what "Call
// next" will pick.
import { dbFrom } from '@/lib/supabase/server';
import type { SymptomCode, TriageSeverity, TicketState } from '@caremind/shared';

export interface QueueTicket {
  id: string;
  ticket_number: number;
  symptom_code: SymptomCode;
  severity: TriageSeverity;
  state: TicketState;
  created_at: string;
  called_at: string | null;
}

type AnyClient = { from: (table: string) => unknown };

export async function listActiveTickets(
  supabase: AnyClient,
  departmentId: string,
): Promise<QueueTicket[]> {
  const { data, error } = await dbFrom(supabase, 'queue_tickets')
    .select('id, ticket_number, symptom_code, severity, state, created_at, called_at')
    .eq('department_id', departmentId)
    .in('state', ['waiting', 'called'])
    .order('priority', { ascending: true })
    .order('ticket_number', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as QueueTicket[];
}

// Pure helper so the UI can show "5m ago" without recomputing dates in JSX.
// Exported separately because it has no dependency on supabase and is trivially
// testable.
export function waitedMinutes(createdAtIso: string, now: Date = new Date()): number {
  const created = new Date(createdAtIso).getTime();
  return Math.max(0, Math.floor((now.getTime() - created) / 60_000));
}
