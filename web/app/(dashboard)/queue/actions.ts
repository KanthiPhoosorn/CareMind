'use server';

// Server actions that wrap the three staff queue RPCs from migration 00007.
// Each RPC is SECURITY DEFINER but still reads auth.uid() / current_hospital_id()
// to enforce that the staff caller belongs to the right hospital. Throwing here
// surfaces RLS / hospital-scope rejections back to the optimistic UI so it can
// roll back its local state.
//
// SMS dispatch on `state → 'called'` is added in Phase C (M4); for now this
// file is purely RPC plumbing.
import { createClient, callRpc } from '@/lib/supabase/server';

export async function callNextTicketAction(departmentId: string) {
  const supabase = await createClient();
  const { data, error } = await callRpc(supabase, 'call_next_ticket', {
    p_department_id: departmentId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export async function markTicketDoneAction(ticketId: string) {
  const supabase = await createClient();
  const { error } = await callRpc(supabase, 'mark_ticket_done', {
    p_ticket_id: ticketId,
  });
  if (error) throw new Error(error.message);
}

export async function markTicketNoShowAction(ticketId: string) {
  const supabase = await createClient();
  const { error } = await callRpc(supabase, 'mark_ticket_no_show', {
    p_ticket_id: ticketId,
  });
  if (error) throw new Error(error.message);
}
