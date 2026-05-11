// Walk-in queue domain types — mirror the DB CHECK constraints in
// supabase/migrations/00004_walkin_queue_schema.sql

export const SYMPTOM_CODES = [
  'cough',
  'fever',
  'stomach',
  'injury',
  'skin',
  'eye_ent',
  'other',
] as const;
export type SymptomCode = (typeof SYMPTOM_CODES)[number];

export const SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export type TriageSeverity = (typeof SEVERITIES)[number];

export const TICKET_STATES = ['waiting', 'called', 'done', 'no_show', 'cancelled'] as const;
export type TicketState = (typeof TICKET_STATES)[number];

// TriageSeverity → priority (lower = served sooner). See spec §3.2.
export const SEVERITY_PRIORITY: Record<TriageSeverity, number> = {
  mild: 100,
  moderate: 50,
  severe: 10,
};

export const TERMINAL_TICKET_STATES: readonly TicketState[] = ['done', 'no_show', 'cancelled'];
