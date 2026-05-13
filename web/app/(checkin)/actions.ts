'use server';

// Server actions for the patient check-in flow (M1).
// All three call SECURITY DEFINER RPCs via the anon key — no auth session needed.
// callRpc() is used instead of supabase.rpc() directly because our handwritten
// Database type can't satisfy Supabase's GenericSchema constraint (Row types lack
// index signatures), which collapses rpc() arg types to `never`.
import { createClient, callRpc } from '@/lib/supabase/server';

export async function createTicket(
  hospitalCode: string,
  symptomCode: string,
  severity: string,
  phoneE164: string,
) {
  const supabase = await createClient();
  const { data, error } = await callRpc(supabase, 'create_walkin_ticket', {
    p_hospital_code: hospitalCode,
    p_symptom_code: symptomCode,
    p_severity: severity,
    p_phone_e164: phoneE164,
    p_locale: 'th',
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('No ticket returned');
  return row;
}

export async function verifyOtp(ticketId: string, otpCode: string) {
  const supabase = await createClient();
  const { data, error } = await callRpc(supabase, 'verify_walkin_ticket', {
    p_ticket_id: ticketId,
    p_otp_code: otpCode,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row?.ok ?? false;
}

export async function cancelTicket(ticketId: string, patientToken: string) {
  const supabase = await createClient();
  const { data, error } = await callRpc(supabase, 'cancel_walkin_ticket', {
    p_ticket_id: ticketId,
    p_patient_token: patientToken,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row?.ok ?? false;
}

export interface TicketWaitEstimate {
  state: string;
  positionInQueue: number;
  estimatedWaitMinutes: number;
}

export async function getTicketWaitEstimate(
  ticketId: string,
  patientToken: string,
): Promise<TicketWaitEstimate | null> {
  const supabase = await createClient();
  const { data, error } = await callRpc(supabase, 'get_ticket_wait_estimate', {
    p_ticket_id: ticketId,
    p_patient_token: patientToken,
  });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    state: row.state,
    positionInQueue: row.position_in_queue,
    estimatedWaitMinutes: row.estimated_wait_minutes,
  };
}
