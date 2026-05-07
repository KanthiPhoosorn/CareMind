export interface Database {
  public: {
    Tables: {
      patients: {
        Row: {
          id: string; admission_number: string; name: string; age: number;
          gender: 'M' | 'F' | 'Other'; ward: string; bed: string;
          admission_date: string; primary_diagnosis: string; attending_doctor: string;
          status: 'Admitted' | 'Discharged' | 'Transfer' | 'Critical';
          created_at: string; updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['patients']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['patients']['Insert']>;
      };
      doctor_notes: {
        Row: {
          id: string; patient_id: string; timestamp: string; doctor_id: string;
          doctor_name: string; specialty: string; chief_complaint: string;
          diagnosis: string; assessment: string; plan: string;
          vital_signs: Record<string, unknown>; notes: string; created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['doctor_notes']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['doctor_notes']['Insert']>;
      };
      medications: {
        Row: {
          id: string; patient_id: string; timestamp: string; order_id: string;
          medication_name: string; dosage: string; route: string; frequency: string;
          duration: string; quantity: number; prescribed_by: string; indication: string;
          instructions: string; status: 'Active' | 'Completed' | 'Discontinued';
          start_date: string; end_date: string | null; created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['medications']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['medications']['Insert']>;
      };
      lab_results: {
        Row: {
          id: string; patient_id: string; timestamp: string; order_id: string;
          test_name: string; status: 'Completed' | 'Pending' | 'In Progress';
          collected_by: string; ordered_by: string;
          results: Record<string, unknown> | null; interpretation: string; created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['lab_results']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['lab_results']['Insert']>;
      };
      nurse_records: {
        Row: {
          id: string; patient_id: string; timestamp: string; nurse_id: string;
          nurse_name: string; shift: 'Day' | 'Evening' | 'Night'; task_type: string;
          vital_signs: Record<string, unknown> | null; medication: string | null;
          notes: string; created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['nurse_records']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['nurse_records']['Insert']>;
      };
      imaging: {
        Row: {
          id: string; patient_id: string; timestamp: string; order_id: string;
          exam_type: string; indication: string; technique: string;
          radiologist_id: string; radiologist_name: string;
          status: 'Final Report' | 'Preliminary' | 'Pending';
          findings: Record<string, unknown>; impression: string;
          recommendations: string; imaging_url: string; created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['imaging']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['imaging']['Insert']>;
      };
      profiles: {
        Row: {
          id: string; email: string; full_name: string;
          role: 'doctor' | 'nurse' | 'pharmacist' | 'patient';
          staff_id: string | null; department: string | null;
          avatar_url: string | null; created_at: string; updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
    };
  };
}
