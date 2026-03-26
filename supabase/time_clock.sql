-- Time clock punch sessions + profile flag. Run in Supabase SQL Editor after user_profiles exists.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS show_punch_interface BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.show_punch_interface IS
  'When true, user may punch in/out on /field; independent of role.';

CREATE TABLE IF NOT EXISTS public.time_clock_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs (id) ON DELETE SET NULL,
  job_name TEXT,
  clock_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out_at TIMESTAMPTZ,
  on_lunch BOOLEAN NOT NULL DEFAULT false,
  lunch_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS time_clock_sessions_employee_idx
  ON public.time_clock_sessions (employee_id);
CREATE INDEX IF NOT EXISTS time_clock_sessions_open_idx
  ON public.time_clock_sessions (clock_in_at DESC)
  WHERE clock_out_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS time_clock_one_open_session_per_employee
  ON public.time_clock_sessions (employee_id)
  WHERE clock_out_at IS NULL;

ALTER TABLE public.time_clock_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "time_clock_sessions_select_own" ON public.time_clock_sessions;
CREATE POLICY "time_clock_sessions_select_own"
  ON public.time_clock_sessions FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

DROP POLICY IF EXISTS "time_clock_sessions_select_admins_active" ON public.time_clock_sessions;
CREATE POLICY "time_clock_sessions_select_admins_active"
  ON public.time_clock_sessions FOR SELECT TO authenticated
  USING (
    clock_out_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles me
      WHERE me.id = auth.uid()
        AND me.is_active = true
        AND me.role IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "time_clock_sessions_insert_punch" ON public.time_clock_sessions;
CREATE POLICY "time_clock_sessions_insert_punch"
  ON public.time_clock_sessions FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND p.show_punch_interface = true
    )
  );

DROP POLICY IF EXISTS "time_clock_sessions_update_own" ON public.time_clock_sessions;
CREATE POLICY "time_clock_sessions_update_own"
  ON public.time_clock_sessions FOR UPDATE TO authenticated
  USING (employee_id = auth.uid())
  WITH CHECK (employee_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.time_clock_sessions TO authenticated;
