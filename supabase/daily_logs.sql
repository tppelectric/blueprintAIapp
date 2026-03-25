-- Daily job logs (JobTread-compatible). Run after `jobs` exists.
-- Uses same active-user pattern as other app tables.

CREATE TABLE IF NOT EXISTS public.daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jobtread_id TEXT,
  log_date DATE NOT NULL,
  job_name TEXT,
  job_id UUID REFERENCES public.jobs (id) ON DELETE SET NULL,
  crew_user TEXT,
  notes TEXT,
  employees_onsite TEXT,
  check_in TIME,
  check_out TIME,
  job_status TEXT,
  trades_onsite TEXT,
  visitors_onsite TEXT,
  additional_notes TEXT,
  materials_used TEXT,
  materials_needed TEXT,
  materials_left_onsite BOOLEAN DEFAULT false,
  equipment_left_onsite TEXT,
  tpp_equipment_left BOOLEAN DEFAULT false,
  anticipated_delays TEXT,
  all_breakers_on BOOLEAN DEFAULT true,
  breakers_off_reason TEXT,
  supply_receipts TEXT,
  card_type TEXT,
  store_receipts TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS daily_logs_job_id_idx ON public.daily_logs (job_id);
CREATE INDEX IF NOT EXISTS daily_logs_log_date_idx ON public.daily_logs (log_date DESC);
CREATE INDEX IF NOT EXISTS daily_logs_crew_user_idx ON public.daily_logs (crew_user);
CREATE INDEX IF NOT EXISTS daily_logs_jobtread_id_idx ON public.daily_logs (jobtread_id);

COMMENT ON TABLE public.daily_logs IS 'Field daily logs; import/export JobTread-style CSV.';

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_logs_select_auth" ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_insert_auth" ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_update_auth" ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_delete_auth" ON public.daily_logs;
DROP POLICY IF EXISTS "daily_logs_all" ON public.daily_logs;

CREATE POLICY "daily_logs_select_auth"
  ON public.daily_logs FOR SELECT TO authenticated
  USING (public.app_user_is_active());

CREATE POLICY "daily_logs_insert_auth"
  ON public.daily_logs FOR INSERT TO authenticated
  WITH CHECK (public.app_user_is_active());

CREATE POLICY "daily_logs_update_auth"
  ON public.daily_logs FOR UPDATE TO authenticated
  USING (public.app_user_is_active())
  WITH CHECK (public.app_user_is_active());

CREATE POLICY "daily_logs_delete_auth"
  ON public.daily_logs FOR DELETE TO authenticated
  USING (public.app_user_is_active());
