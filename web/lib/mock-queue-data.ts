// Mock data for the walk-in queue staff dashboard (M2).
// Department IDs and codes match the seed data in supabase/seed.sql so
// swapping to real Supabase queries (Sprint 1) won't require UI changes.
// TODO: replace getMockTickets() with supabase.from('queue_tickets') once staff auth is wired.

export const MOCK_DEPARTMENTS = [
  { code: 'GP',    nameTh: 'ทั่วไป',      nameEn: 'General Practice',  id: 'aaaa0000-0000-0000-0000-000000000001' },
  { code: 'INTMED',nameTh: 'อายุรกรรม',   nameEn: 'Internal Medicine', id: 'aaaa0000-0000-0000-0000-000000000002' },
  { code: 'DERM',  nameTh: 'ผิวหนัง',     nameEn: 'Dermatology',       id: 'aaaa0000-0000-0000-0000-000000000003' },
  { code: 'ENT',   nameTh: 'หู คอ จมูก', nameEn: 'ENT',               id: 'aaaa0000-0000-0000-0000-000000000004' },
  { code: 'OPHTH', nameTh: 'จักษุ',       nameEn: 'Ophthalmology',     id: 'aaaa0000-0000-0000-0000-000000000005' },
  { code: 'ORTHO', nameTh: 'กระดูก',      nameEn: 'Orthopedics',       id: 'aaaa0000-0000-0000-0000-000000000006' },
  { code: 'ER',    nameTh: 'ฉุกเฉิน',     nameEn: 'Emergency',         id: 'aaaa0000-0000-0000-0000-000000000007' },
] as const;

export type MockDepartment = (typeof MOCK_DEPARTMENTS)[number];

export interface MockTicket {
  id: string;
  ticketNumber: number;
  symptomCode: string;
  severity: 'mild' | 'moderate' | 'severe';
  state: 'waiting' | 'called';
  waitedMinutes: number;
}

const now = () => Date.now();

export function getMockTickets(departmentCode: string): MockTicket[] {
  const t = now();
  void t; // used only to hint freshness; values are static for SSR stability
  const byDept: Record<string, MockTicket[]> = {
    INTMED: [
      { id: 'it1', ticketNumber: 12, symptomCode: 'cough',  severity: 'moderate', state: 'called',  waitedMinutes: 25 },
      { id: 'it2', ticketNumber: 13, symptomCode: 'fever',  severity: 'severe',   state: 'waiting', waitedMinutes: 18 },
      { id: 'it3', ticketNumber: 14, symptomCode: 'cough',  severity: 'mild',     state: 'waiting', waitedMinutes: 12 },
      { id: 'it4', ticketNumber: 15, symptomCode: 'fever',  severity: 'moderate', state: 'waiting', waitedMinutes: 8  },
    ],
    GP: [
      { id: 'gp1', ticketNumber: 7,  symptomCode: 'stomach', severity: 'mild', state: 'called',  waitedMinutes: 15 },
      { id: 'gp2', ticketNumber: 8,  symptomCode: 'other',   severity: 'mild', state: 'waiting', waitedMinutes: 10 },
      { id: 'gp3', ticketNumber: 9,  symptomCode: 'fever',   severity: 'mild', state: 'waiting', waitedMinutes: 5  },
    ],
    ER: [
      { id: 'er1', ticketNumber: 3, symptomCode: 'injury', severity: 'severe', state: 'called', waitedMinutes: 5 },
    ],
  };
  return byDept[departmentCode] ?? [];
}
