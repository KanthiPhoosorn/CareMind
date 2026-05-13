// Triage queue lookups for the staff dashboard.
// Returns pending_triage tickets ordered by arrival (ticket_number ASC) so
// nurses see the earliest arrival first.
import { dbFrom } from '@/lib/supabase/server';
import type { SymptomCode } from '@caremind/shared';

export interface TriageTicket {
  id: string;
  ticket_number: number;
  symptom_code: SymptomCode;
  phone_e164: string;
  created_at: string;
}

type AnyClient = { from: (table: string) => unknown };

export async function listPendingTriageTickets(supabase: AnyClient): Promise<TriageTicket[]> {
  const { data, error } = await dbFrom(supabase, 'queue_tickets')
    .select('id, ticket_number, symptom_code, phone_e164, created_at')
    .eq('state', 'pending_triage')
    .order('ticket_number', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as TriageTicket[];
}
