-- Role-based access (Blueprint AI). Run in Supabase SQL Editor after base schema + RLS exist.
-- Creates user_profiles, helper functions, auth trigger, jobs.assigned_user_id, and replaces
-- policies for jobs, customers, job_attachments, projects, sheets, project_room_scans, project_symbols.

-- ── 1) user_profiles ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'estimator'
    CHECK (
      role IN (
        'super_admin',
        'admin',
        'estimator',
        'field_tech',
        'office_manager'
      )
    ),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_profiles_role_idx ON public.user_profiles (role);
CREATE INDEX IF NOT EXISTS user_profiles_email_idx ON public.user_profiles (email);

COMMENT ON TABLE public.user_profiles IS 'App role and display fields; id matches auth.users.';

CREATE OR REPLACE FUNCTION public.user_profiles_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_touch_updated ON public.user_profiles;
CREATE TRIGGER user_profiles_touch_updated
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.user_profiles_set_updated_at();

-- Auto-create profile on signup (default role estimator).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    'estimator'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 2) Role helpers (SECURITY DEFINER; used in RLS) ─────────────────────────
CREATE OR REPLACE FUNCTION public.app_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_profiles WHERE id = auth.uid()),
    'estimator'
  );
$$;

CREATE OR REPLACE FUNCTION public.app_user_is_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.user_profiles WHERE id = auth.uid()),
    true
  );
$$;

-- Field tech may open a blueprint only when a job assigns them and links this project.
CREATE OR REPLACE FUNCTION public.user_can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.app_user_is_active()
    AND (
      public.app_user_role() <> 'field_tech'
      OR EXISTS (
        SELECT 1
        FROM public.job_attachments ja
        INNER JOIN public.jobs j ON j.id = ja.job_id
        WHERE ja.attachment_id = p_project_id
          AND ja.attachment_type IN ('blueprint_project', 'takeoff')
          AND j.assigned_user_id = auth.uid()
      )
    );
$$;

GRANT SELECT ON public.user_profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_user_is_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_project(UUID) TO authenticated;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles_select_own" ON public.user_profiles;
CREATE POLICY "user_profiles_select_own" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- ── 3) Jobs: assignee for field tech ────────────────────────────────────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS jobs_assigned_user_id_idx
  ON public.jobs (assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

-- ── 4) jobs policies ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "jobs_select_auth" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_auth" ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_auth" ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete_auth" ON public.jobs;

CREATE POLICY "jobs_select_auth" ON public.jobs
  FOR SELECT TO authenticated
  USING (
    public.app_user_is_active()
    AND (
      public.app_user_role() <> 'field_tech'
      OR (
        assigned_user_id IS NOT NULL
        AND assigned_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "jobs_insert_auth" ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() <> 'field_tech'
  );

CREATE POLICY "jobs_update_auth" ON public.jobs
  FOR UPDATE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() <> 'field_tech'
  )
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() <> 'field_tech'
  );

CREATE POLICY "jobs_delete_auth" ON public.jobs
  FOR DELETE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() <> 'field_tech'
  );

-- ── 5) customers ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "customers_select_auth" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_auth" ON public.customers;
DROP POLICY IF EXISTS "customers_update_auth" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_auth" ON public.customers;

CREATE POLICY "customers_select_auth" ON public.customers
  FOR SELECT TO authenticated
  USING (
    public.app_user_is_active()
    AND (
      public.app_user_role() <> 'field_tech'
      OR EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.customer_id = customers.id
          AND j.assigned_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "customers_insert_auth" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() <> 'field_tech'
  );

CREATE POLICY "customers_update_auth" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() <> 'field_tech'
  )
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() <> 'field_tech'
  );

CREATE POLICY "customers_delete_auth" ON public.customers
  FOR DELETE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() <> 'field_tech'
  );

-- ── 6) job_attachments ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "job_attachments_select_auth" ON public.job_attachments;
DROP POLICY IF EXISTS "job_attachments_insert_auth" ON public.job_attachments;
DROP POLICY IF EXISTS "job_attachments_delete_auth" ON public.job_attachments;

CREATE POLICY "job_attachments_select_auth" ON public.job_attachments
  FOR SELECT TO authenticated
  USING (
    public.app_user_is_active()
    AND (
      public.app_user_role() <> 'field_tech'
      OR EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id = job_attachments.job_id
          AND j.assigned_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "job_attachments_insert_auth" ON public.job_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() <> 'field_tech'
  );

CREATE POLICY "job_attachments_delete_auth" ON public.job_attachments
  FOR DELETE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() <> 'field_tech'
  );

-- ── 7) projects & sheets ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_select_auth" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_auth" ON public.projects;
DROP POLICY IF EXISTS "projects_update_auth" ON public.projects;
DROP POLICY IF EXISTS "projects_delete_auth" ON public.projects;

CREATE POLICY "projects_select_auth" ON public.projects
  FOR SELECT TO authenticated
  USING (public.user_can_access_project(id));

CREATE POLICY "projects_insert_auth" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  );

CREATE POLICY "projects_update_auth" ON public.projects
  FOR UPDATE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  )
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  );

CREATE POLICY "projects_delete_auth" ON public.projects
  FOR DELETE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  );

DROP POLICY IF EXISTS "sheets_select_auth" ON public.sheets;
DROP POLICY IF EXISTS "sheets_insert_auth" ON public.sheets;
DROP POLICY IF EXISTS "sheets_update_auth" ON public.sheets;
DROP POLICY IF EXISTS "sheets_delete_auth" ON public.sheets;

CREATE POLICY "sheets_select_auth" ON public.sheets
  FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY "sheets_insert_auth" ON public.sheets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  );

CREATE POLICY "sheets_update_auth" ON public.sheets
  FOR UPDATE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  )
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  );

CREATE POLICY "sheets_delete_auth" ON public.sheets
  FOR DELETE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  );

-- ── 8) project_room_scans ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "project_room_scans_select_auth" ON public.project_room_scans;
DROP POLICY IF EXISTS "project_room_scans_insert_auth" ON public.project_room_scans;
DROP POLICY IF EXISTS "project_room_scans_delete_auth" ON public.project_room_scans;

CREATE POLICY "project_room_scans_select_auth" ON public.project_room_scans
  FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY "project_room_scans_insert_auth" ON public.project_room_scans
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  );

CREATE POLICY "project_room_scans_delete_auth" ON public.project_room_scans
  FOR DELETE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  );

-- ── 9) project_symbols (viewer / legend) ───────────────────────────────────
DROP POLICY IF EXISTS "symbols_select_all" ON public.project_symbols;
DROP POLICY IF EXISTS "symbols_insert_all" ON public.project_symbols;
DROP POLICY IF EXISTS "symbols_update_all" ON public.project_symbols;
DROP POLICY IF EXISTS "symbols_delete_all" ON public.project_symbols;

CREATE POLICY "project_symbols_select_auth" ON public.project_symbols
  FOR SELECT TO authenticated
  USING (public.user_can_access_project(project_id));

CREATE POLICY "project_symbols_insert_auth" ON public.project_symbols
  FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  );

CREATE POLICY "project_symbols_update_auth" ON public.project_symbols
  FOR UPDATE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  )
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  );

CREATE POLICY "project_symbols_delete_auth" ON public.project_symbols
  FOR DELETE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN (
      'super_admin',
      'admin',
      'estimator',
      'office_manager'
    )
  );
