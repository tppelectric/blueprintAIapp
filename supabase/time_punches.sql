-- Field punch in/out (time_punches). Run after user_profiles + jobs exist.
-- Replaces time_clock_sessions for new punches; old sessions remain historical only if you used them.

CREATE TABLE IF NOT EXISTS public.time_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs (id) ON DELETE SET NULL,
  job_name TEXT,
  punch_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  punch_out_at TIMESTAMPTZ,
  notes TEXT,
  lunch_start_at TIMESTAMPTZ,
  lunch_end_at TIMESTAMPTZ,
  on_lunch BOOLEAN NOT NULL DEFAULT false,
  total_lunch_ms BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS time_punches_employee_idx
  ON public.time_punches (employee_id);
CREATE INDEX IF NOT EXISTS time_punches_open_idx
  ON public.time_punches (punch_in_at DESC)
  WHERE punch_out_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS time_punches_one_open_per_employee
  ON public.time_punches (employee_id)
  WHERE punch_out_at IS NULL;

ALTER TABLE public.time_punches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "time_punches_select_own" ON public.time_punches;
CREATE POLICY "time_punches_select_own"
  ON public.time_punches FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

DROP POLICY IF EXISTS "time_punches_select_managers_open" ON public.time_punches;
CREATE POLICY "time_punches_select_managers_open"
  ON public.time_punches FOR SELECT TO authenticated
  USING (
    punch_out_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles me
      WHERE me.id = auth.uid()
        AND me.is_active = true
        AND me.role IN ('super_admin', 'admin', 'office_manager')
    )
  );

DROP POLICY IF EXISTS "time_punches_insert_punch" ON public.time_punches;
CREATE POLICY "time_punches_insert_punch"
  ON public.time_punches FOR INSERT TO authenticated
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

DROP POLICY IF EXISTS "time_punches_update_own" ON public.time_punches;
CREATE POLICY "time_punches_update_own"
  ON public.time_punches FOR UPDATE TO authenticated
  USING (employee_id = auth.uid())
  WITH CHECK (employee_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.time_punches TO authenticated;
