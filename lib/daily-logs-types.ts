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
  created_at: string;
};

export type DailyLogInsert = Omit<DailyLogRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};
