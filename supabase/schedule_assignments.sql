-- Scheduling Phase 1: assign employees to a job on a date.
-- Foundation for scheduling + reconciliation (scheduled vs actual from
-- time_punches / timesheets). Run in the Supabase SQL Editor.

-- 1) can_schedule flag — lets foreman / lead techs schedule WITHOUT adding new
--    role enums (super_admin + office_manager can schedule implicitly).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS can_schedule BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.can_schedule IS
  'Allows this user to create/edit schedule assignments (e.g. foreman, lead tech). super_admin/office_manager can always schedule.';

-- 2) schedule_assignments table
CREATE TABLE IF NOT EXISTS public.schedule_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES auth.users (id) ON DELETE CASCADE,
  employee_name TEXT,
  job_id UUID REFERENCES public.jobs (id) ON DELETE SET NULL,
  job_name TEXT,
  schedule_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  notes TEXT,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS schedule_assignments_date_idx
  ON public.schedule_assignments (schedule_date);
CREATE INDEX IF NOT EXISTS schedule_assignments_employee_idx
  ON public.schedule_assignments (employee_id);
CREATE INDEX IF NOT EXISTS schedule_assignments_job_idx
  ON public.schedule_assignments (job_id);

-- Prevent exact duplicate (same employee, job, date) assignments.
CREATE UNIQUE INDEX IF NOT EXISTS schedule_assignments_unique_day_job
  ON public.schedule_assignments (employee_id, job_id, schedule_date);

ALTER TABLE public.schedule_assignments ENABLE ROW LEVEL SECURITY;

-- 3) RLS
-- Read: any active authenticated user (team visibility; employees see their own + team).
DROP POLICY IF EXISTS "schedule_assignments_select" ON public.schedule_assignments;
CREATE POLICY "schedule_assignments_select"
  ON public.schedule_assignments FOR SELECT TO authenticated
  USING (public.app_user_is_active());

-- Write: super_admin / office_manager, or anyone with can_schedule = true.
DROP POLICY IF EXISTS "schedule_assignments_insert" ON public.schedule_assignments;
CREATE POLICY "schedule_assignments_insert"
  ON public.schedule_assignments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND (p.role IN ('super_admin', 'office_manager') OR p.can_schedule = true)
    )
  );

DROP POLICY IF EXISTS "schedule_assignments_update" ON public.schedule_assignments;
CREATE POLICY "schedule_assignments_update"
  ON public.schedule_assignments FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND (p.role IN ('super_admin', 'office_manager') OR p.can_schedule = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND (p.role IN ('super_admin', 'office_manager') OR p.can_schedule = true)
    )
  );

DROP POLICY IF EXISTS "schedule_assignments_delete" ON public.schedule_assignments;
CREATE POLICY "schedule_assignments_delete"
  ON public.schedule_assignments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND p.is_active = true
        AND (p.role IN ('super_admin', 'office_manager') OR p.can_schedule = true)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_assignments TO authenticated;
