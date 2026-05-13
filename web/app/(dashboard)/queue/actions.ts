'use server';

// Server actions that wrap the three staff queue RPCs from migration 00007.
// Each RPC is SECURITY DEFINER but still reads auth.uid() / current_hospital_id()
// to enforce that the staff caller belongs to the right hospital. Throwing here
// surfaces RLS / hospital-scope rejections back to the optimistic UI so it can
// roll back its local state.
//
// After a successful call_next_ticket() we dispatch an SMS via the configured
// provider (see lib/sms) and append a row to sms_dispatch_log. Dispatch
// failures are recorded but never throw — a missed SMS shouldn't roll back
// a valid 'called' state.
import { createClient, callRpc, dbFrom } from '@/lib/supabase/server';
import { resolveSmsProvider, ticketCalledMessage } from '@/lib/sms';

interface TicketContact {
  phone_e164: string;
  department: {
    name_en: string;
    name_th: string;
  } | null;
}

async function loadDispatchContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticketId: string,
): Promise<TicketContact | null> {
  const { data, error } = await dbFrom(supabase, 'queue_tickets')
    .select('phone_e164, department:departments(name_en, name_th)')
    .eq('id', ticketId)
    .maybeSingle();
  if (error) return null;
  return (data as TicketContact | null) ?? null;
}

async function logDispatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: {
    ticket_id: string;
    to_phone: string;
    body: string;
    provider: string;
    message_id: string | null;
    error: string | null;
  },
) {
  await dbFrom(supabase, 'sms_dispatch_log').insert(row);
}

export async function callNextTicketAction(departmentId: string) {
  const supabase = await createClient();
  const { data, error } = await callRpc(supabase, 'call_next_ticket', {
    p_department_id: departmentId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ticket_id || !row.ticket_number) return row ?? null;

  // Best-effort SMS dispatch. We deliberately swallow provider errors and log
  // them so the staff-side state remains 'called'. The dispatch_log row gives
  // ops a way to retry or investigate.
  const ctx = await loadDispatchContext(supabase, row.ticket_id);
  if (ctx?.phone_e164 && ctx.department) {
    const provider = resolveSmsProvider();
    const body = ticketCalledMessage(
      row.ticket_number,
      ctx.department.name_en,
      ctx.department.name_th,
      'th',
    );
    try {
      const result = await provider.send(ctx.phone_e164, body, 'th');
      await logDispatch(supabase, {
        ticket_id: row.ticket_id,
        to_phone: ctx.phone_e164,
        body,
        provider: result.provider,
        message_id: result.messageId,
        error: null,
      });
    } catch (e) {
      await logDispatch(supabase, {
        ticket_id: row.ticket_id,
        to_phone: ctx.phone_e164,
        body,
        provider: provider.key,
        message_id: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return row;
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

export async function triageTicketAction(
  ticketId: string,
  severity: 'mild' | 'moderate' | 'severe',
) {
  const supabase = await createClient();
  const { data, error } = await callRpc(supabase, 'triage_walkin_ticket', {
    p_ticket_id: ticketId,
    p_severity: severity,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}
