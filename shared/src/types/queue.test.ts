import { describe, it, expect } from 'vitest';
import {
  SYMPTOM_CODES,
  SEVERITIES,
  TICKET_STATES,
  SEVERITY_PRIORITY,
  TERMINAL_TICKET_STATES,
} from './queue';

describe('queue domain types', () => {
  it('lists the seven walk-in symptom codes', () => {
    expect(SYMPTOM_CODES).toEqual([
      'cough',
      'fever',
      'stomach',
      'injury',
      'skin',
      'eye_ent',
      'other',
    ]);
  });

  it('lists three severities', () => {
    expect(SEVERITIES).toEqual(['mild', 'moderate', 'severe']);
  });

  it('lists six ticket states including pending_triage', () => {
    expect(TICKET_STATES).toEqual([
      'pending_triage',
      'waiting',
      'called',
      'done',
      'no_show',
      'cancelled',
    ]);
  });

  it('maps severity to monotonically decreasing priority values', () => {
    expect(SEVERITY_PRIORITY.severe).toBeLessThan(SEVERITY_PRIORITY.moderate);
    expect(SEVERITY_PRIORITY.moderate).toBeLessThan(SEVERITY_PRIORITY.mild);
  });

  it('marks done / no_show / cancelled as terminal', () => {
    expect(TERMINAL_TICKET_STATES).toEqual(['done', 'no_show', 'cancelled']);
  });
});
