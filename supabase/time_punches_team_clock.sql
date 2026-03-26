-- Team clock dashboard: company admins can read all punches + Realtime.
-- Run after time_punches.sql and user_profiles_rbac.sql.

-- Allow super_admin and admin to SELECT all time_punches (OR with existing policies).
DROP POLICY IF EXISTS "time_punches_select_company_admin" ON public.time_punches;
CREATE POLICY "time_punches_select_company_admin"
  ON public.time_punches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles u
      WHERE u.id = auth.uid()
        AND u.is_active = true
        AND u.role IN ('super_admin', 'admin')
    )
  );

-- Supabase Realtime: add table to publication (safe to run once; ignore duplicate errors in Dashboard).
ALTER PUBLICATION supabase_realtime ADD TABLE public.time_punches;
