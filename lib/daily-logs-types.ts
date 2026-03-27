/** Row from `public.daily_logs` (Supabase). */
export type DailyLogRow = {
  id: string;
  jobtread_id: string | null;
  log_date: string;
  job_name: string | null;
  job_id: string | null;
  crew_user: string | null;
  notes: string | null;
  employees_onsite: string | null;
  check_in: string | null;
  check_out: string | null;
  job_status: string | null;
  trades_onsite: string | null;
  visitors_onsite: string | null;
  additional_notes: string | null;
  materials_used: string | null;
  materials_needed: string | null;
  materials_left_onsite: boolean | null;
  equipment_left_onsite: string | null;
  tpp_equipment_left: boolean | null;
  anticipated_delays: string | null;
  all_breakers_on: boolean | null;
  breakers_off_reason: string | null;
  supply_receipts: string | null;
  card_type: string | null;
  store_receipts: string | null;
  internal_notes: string | null;
  weather: string | null;
  lunch_duration_minutes: number | null;
  equipment_used: string | null;
  work_completed: string | null;
  next_day_plan: string | null;
  safety_incident: boolean | null;
  safety_incident_notes: string | null;
  /** Object path in `daily-log-pdfs` bucket when a PDF was generated. */
  pdf_storage_path?: string | null;
  created_at: string;
};

export type DailyLogInsert = Omit<DailyLogRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};
