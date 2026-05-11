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
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
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
        > & {
          priority?: number;
          state?: TicketState;
        };
        Update: Partial<Database['public']['Tables']['queue_tickets']['Insert']>;
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
      };
    };
  };
}
