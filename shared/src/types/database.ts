// Handwritten Database type for Supabase.
// `Relationships: never[]` is required on every table so the shape satisfies
// Supabase's internal GenericTable. Even with it, Row types still lack index
// signatures ([key: string]: unknown), so Database['public'] does NOT extend
// GenericSchema — use callRpc() in server.ts for typed RPC calls instead of
// supabase.rpc() directly.
import type { SymptomCode, TriageSeverity, TicketState } from './queue';

export interface Database {
  public: {
    Tables: {
      patients: {
        Row: {
          id: string;
          admission_number: string;
          name: string;
          age: number;
          gender: 'M' | 'F' | 'Other';
          ward: string;
          bed: string;
          admission_date: string;
          primary_diagnosis: string;
          attending_doctor: string;
          status: 'Admitted' | 'Discharged' | 'Transfer' | 'Critical';
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['patients']['Row'],
          'id' | 'created_at' | 'updated_at'
        >;
        Update: Partial<Database['public']['Tables']['patients']['Insert']>;
        Relationships: never[];
      };
      doctor_notes: {
        Row: {
          id: string;
          patient_id: string;
          timestamp: string;
          doctor_id: string;
          doctor_name: string;
          specialty: string;
          chief_complaint: string;
          diagnosis: string;
          assessment: string;
          plan: string;
          vital_signs: Record<string, unknown>;
          notes: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['doctor_notes']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['doctor_notes']['Insert']>;
        Relationships: never[];
      };
      medications: {
        Row: {
          id: string;
          patient_id: string;
          timestamp: string;
          order_id: string;
          medication_name: string;
          dosage: string;
          route: string;
          frequency: string;
          duration: string;
          quantity: number;
          prescribed_by: string;
          indication: string;
          instructions: string;
          status: 'Active' | 'Completed' | 'Discontinued';
          start_date: string;
          end_date: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['medications']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['medications']['Insert']>;
        Relationships: never[];
      };
      lab_results: {
        Row: {
          id: string;
          patient_id: string;
          timestamp: string;
          order_id: string;
          test_name: string;
          status: 'Completed' | 'Pending' | 'In Progress';
          collected_by: string;
          ordered_by: string;
          results: Record<string, unknown> | null;
          interpretation: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['lab_results']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['lab_results']['Insert']>;
        Relationships: never[];
      };
      nurse_records: {
        Row: {
          id: string;
          patient_id: string;
          timestamp: string;
          nurse_id: string;
          nurse_name: string;
          shift: 'Day' | 'Evening' | 'Night';
          task_type: string;
          vital_signs: Record<string, unknown> | null;
          medication: string | null;
          notes: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['nurse_records']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['nurse_records']['Insert']>;
        Relationships: never[];
      };
      imaging: {
        Row: {
          id: string;
          patient_id: string;
          timestamp: string;
          order_id: string;
          exam_type: string;
          indication: string;
          technique: string;
          radiologist_id: string;
          radiologist_name: string;
          status: 'Final Report' | 'Preliminary' | 'Pending';
          findings: Record<string, unknown>;
          impression: string;
          recommendations: string;
          imaging_url: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['imaging']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['imaging']['Insert']>;
        Relationships: never[];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: 'doctor' | 'nurse' | 'pharmacist' | 'patient';
          staff_id: string | null;
          department: string | null;
          avatar_url: string | null;
          hospital_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: never[];
      };
      hospitals: {
        Row: {
          id: string;
          name: string;
          code: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['hospitals']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['hospitals']['Insert']>;
        Relationships: never[];
      };
      departments: {
        Row: {
          id: string;
          hospital_id: string;
          code: string;
          name_th: string;
          name_en: string;
          is_active: boolean;
          no_show_seconds: number;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['departments']['Row'],
          'id' | 'created_at' | 'is_active' | 'no_show_seconds'
        > & {
          is_active?: boolean;
          no_show_seconds?: number;
        };
        Update: Partial<Database['public']['Tables']['departments']['Insert']>;
        Relationships: never[];
      };
      routing_rules: {
        Row: {
          id: string;
          hospital_id: string;
          symptom_code: SymptomCode;
          severity: TriageSeverity | null;
          target_department_id: string;
          priority: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['routing_rules']['Row'],
          'id' | 'created_at' | 'is_active' | 'priority'
        > & {
          is_active?: boolean;
          priority?: number;
        };
        Update: Partial<Database['public']['Tables']['routing_rules']['Insert']>;
        Relationships: never[];
      };
      queue_tickets: {
        Row: {
          id: string;
          hospital_id: string;
          department_id: string;
          ticket_number: number;
          phone_e164: string;
          symptom_code: SymptomCode;
          severity: TriageSeverity;
          priority: number;
          state: TicketState;
          created_at: string;
          verified_at: string | null;
          called_at: string | null;
          done_at: string | null;
          cancelled_at: string | null;
          no_show_at: string | null;
          patient_token_hash: string;
          otp_code_hash: string | null;
          otp_expires_at: string | null;
          otp_attempts: number;
          called_by: string | null;
          completed_by: string | null;
        };
        Insert: Omit<
          Database['public']['Tables']['queue_tickets']['Row'],
          | 'id'
          | 'created_at'
          | 'verified_at'
          | 'called_at'
          | 'done_at'
          | 'cancelled_at'
          | 'no_show_at'
          | 'called_by'
          | 'completed_by'
          | 'priority'
          | 'state'
          | 'otp_code_hash'
          | 'otp_expires_at'
          | 'otp_attempts'
        > & {
          priority?: number;
          state?: TicketState;
        };
        Update: Partial<Database['public']['Tables']['queue_tickets']['Insert']>;
        Relationships: never[];
      };
      queue_ticket_events: {
        Row: {
          id: number;
          ticket_id: string;
          from_state: TicketState | null;
          to_state: TicketState;
          actor: string | null;
          occurred_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['queue_ticket_events']['Row'],
          'id' | 'occurred_at'
        >;
        Update: Partial<Database['public']['Tables']['queue_ticket_events']['Insert']>;
        Relationships: never[];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_walkin_ticket: {
        Args: {
          p_hospital_code: string;
          p_symptom_code: string;
          p_severity: string;
          p_phone_e164: string;
          p_locale?: string;
        };
        Returns: Array<{
          ticket_id: string;
          ticket_number: number;
          department_code: string;
          department_name_th: string;
          department_name_en: string;
          position_in_queue: number;
          patient_token: string;
          otp_code: string;
        }>;
      };
      verify_walkin_ticket: {
        Args: { p_ticket_id: string; p_otp_code: string };
        Returns: Array<{ ok: boolean }>;
      };
      cancel_walkin_ticket: {
        Args: { p_ticket_id: string; p_patient_token: string };
        Returns: Array<{ ok: boolean }>;
      };
      call_next_ticket: {
        Args: { p_department_id: string };
        Returns: Array<{
          ticket_id: string | null;
          ticket_number: number | null;
          symptom_code: string | null;
          severity: string | null;
          waited_seconds: number | null;
        }>;
      };
      mark_ticket_done: {
        Args: { p_ticket_id: string };
        Returns: undefined;
      };
      mark_ticket_no_show: {
        Args: { p_ticket_id: string };
        Returns: undefined;
      };
      current_hospital_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      estimate_wait_minutes: {
        Args: { p_department_id: string; p_position: number };
        Returns: number;
      };
      sweep_stale_called_tickets: {
        Args: Record<string, never>;
        Returns: number;
      };
      get_ticket_wait_estimate: {
        Args: { p_ticket_id: string; p_patient_token: string };
        Returns: Array<{
          state: string;
          position_in_queue: number;
          estimated_wait_minutes: number;
        }>;
      };
    };
  };
}
