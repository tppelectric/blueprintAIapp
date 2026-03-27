-- GPS snapshots, manual punches, GPS override. Run after time_punches + time_punches_audit.sql + user_profiles.

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS punch_in_location JSONB;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS punch_out_location JSONB;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS lunch_start_location JSONB;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS lunch_end_location JSONB;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS gps_location_flagged BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS gps_override_at TIMESTAMPTZ;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS gps_override_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS gps_override_reason TEXT;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS is_manual_entry BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS manual_entry_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS manual_entry_at TIMESTAMPTZ;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS manual_entry_note TEXT;

COMMENT ON COLUMN public.time_punches.punch_in_location IS
  '{"lat","lng","accuracy","distance_from_job_ft","on_site_verified","status","job_geocoded"}';

CREATE TABLE IF NOT EXISTS public.time_punch_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  time_punch_id UUID NOT NULL REFERENCES public.time_punches (id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS time_punch_audit_log_punch_idx
  ON public.time_punch_audit_log (time_punch_id, created_at DESC);

ALTER TABLE public.time_punch_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "time_punch_audit_log_insert" ON public.time_punch_audit_log;
CREATE POLICY "time_punch_audit_log_insert"
  ON public.time_punch_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND actor_id = auth.uid()
  );

DROP POLICY IF EXISTS "time_punch_audit_log_select" ON public.time_punch_audit_log;
CREATE POLICY "time_punch_audit_log_select"
  ON public.time_punch_audit_log FOR SELECT TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN ('super_admin', 'admin')
  );

GRANT SELECT, INSERT ON public.time_punch_audit_log TO authenticated;

-- Super admin: insert punches for any employee (manual punch)
DROP POLICY IF EXISTS "time_punches_insert_super_admin" ON public.time_punches;
CREATE POLICY "time_punches_insert_super_admin"
  ON public.time_punches FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() = 'super_admin'
  );

-- Super admin + admin: update any punch (manual edits, overrides)
DROP POLICY IF EXISTS "time_punches_update_managers" ON public.time_punches;
CREATE POLICY "time_punches_update_managers"
  ON public.time_punches FOR UPDATE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN ('super_admin', 'admin')
  )
  WITH CHECK (public.app_user_is_active());
