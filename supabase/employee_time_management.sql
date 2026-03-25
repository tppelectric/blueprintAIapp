-- Employee time: timesheets, time-off requests, work calendar.
-- Run after: jobs, daily_logs, user_profiles, app_user_is_active / app_user_role.

-- ── 1) timesheets ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES auth.users (id),
  employee_name TEXT,
  job_id UUID REFERENCES public.jobs (id) ON DELETE SET NULL,
  job_name TEXT,
  log_date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  hours_worked NUMERIC(5, 2),
  overtime_hours NUMERIC(5, 2) DEFAULT 0,
  entry_type TEXT NOT NULL DEFAULT 'regular'
    CHECK (
      entry_type IN (
        'regular',
        'overtime',
        'pto',
        'sick',
        'holiday',
        'unpaid'
      )
    ),
  daily_log_id UUID REFERENCES public.daily_logs (id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users (id),
  approved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS timesheets_daily_log_id_key
  ON public.timesheets (daily_log_id)
  WHERE daily_log_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS timesheets_log_date_idx ON public.timesheets (log_date DESC);
CREATE INDEX IF NOT EXISTS timesheets_employee_id_idx ON public.timesheets (employee_id);
CREATE INDEX IF NOT EXISTS timesheets_status_idx ON public.timesheets (status);

-- ── 2) time_off_requests ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES auth.users (id),
  employee_name TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'pto'
    CHECK (request_type IN ('pto', 'sick', 'personal', 'unpaid', 'holiday')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by UUID REFERENCES auth.users (id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS time_off_employee_idx ON public.time_off_requests (employee_id);
CREATE INDEX IF NOT EXISTS time_off_status_idx ON public.time_off_requests (status);
CREATE INDEX IF NOT EXISTS time_off_dates_idx ON public.time_off_requests (start_date, end_date);

-- ── 3) work_calendar ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.work_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_date DATE NOT NULL,
  employee_id UUID REFERENCES auth.users (id),
  employee_name TEXT,
  event_type TEXT NOT NULL DEFAULT 'work'
    CHECK (event_type IN ('work', 'time_off', 'holiday', 'scheduled')),
  job_id UUID REFERENCES public.jobs (id) ON DELETE SET NULL,
  job_name TEXT,
  check_in TIME,
  check_out TIME,
  hours NUMERIC(5, 2),
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('daily_log', 'timesheet', 'time_off', 'manual')),
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS work_calendar_daily_log_ref
  ON public.work_calendar (reference_id)
  WHERE source = 'daily_log';

CREATE UNIQUE INDEX IF NOT EXISTS work_calendar_time_off_day
  ON public.work_calendar (reference_id, calendar_date)
  WHERE source = 'time_off';

CREATE INDEX IF NOT EXISTS work_calendar_date_idx ON public.work_calendar (calendar_date);
CREATE INDEX IF NOT EXISTS work_calendar_employee_idx ON public.work_calendar (employee_id);
CREATE INDEX IF NOT EXISTS work_calendar_event_idx ON public.work_calendar (event_type);

COMMENT ON TABLE public.timesheets IS 'Payroll-style entries; auto-linked from daily_logs.';
COMMENT ON TABLE public.time_off_requests IS 'PTO / sick / personal requests.';
COMMENT ON TABLE public.work_calendar IS 'Aggregated day view: work + time off; reference_id links source row.';

-- ── 4) Sync daily_logs → timesheets + work_calendar ─────────────────────────
CREATE OR REPLACE FUNCTION public.sync_daily_log_to_time_tables()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
  ename TEXT;
  total_hours NUMERIC;
  reg_h NUMERIC;
  ot_h NUMERIC;
  cin TIME;
  cout TIME;
BEGIN
  cin := NEW.check_in;
  cout := NEW.check_out;

  IF cin IS NOT NULL AND cout IS NOT NULL THEN
    IF cout < cin THEN
      total_hours :=
        EXTRACT(
          EPOCH FROM ((cout + INTERVAL '24 hours') - cin)
        ) / 3600.0;
    ELSE
      total_hours := EXTRACT(EPOCH FROM (cout - cin)) / 3600.0;
    END IF;
    reg_h := LEAST(total_hours, 8);
    ot_h := GREATEST(0, total_hours - 8);
  ELSE
    total_hours := NULL;
    reg_h := NULL;
    ot_h := NULL;
  END IF;

  uid := NULL;
  ename := NULL;
  IF NEW.crew_user IS NOT NULL AND TRIM(NEW.crew_user) <> '' THEN
    SELECT p.id, COALESCE(NULLIF(TRIM(p.full_name), ''), p.email)
    INTO uid, ename
    FROM public.user_profiles p
    WHERE LOWER(TRIM(p.full_name)) = LOWER(TRIM(NEW.crew_user))
       OR LOWER(TRIM(p.email)) = LOWER(TRIM(NEW.crew_user))
    LIMIT 1;
  END IF;
  IF ename IS NULL THEN
    ename := NULLIF(TRIM(NEW.crew_user), '');
  END IF;

  INSERT INTO public.timesheets (
    employee_id,
    employee_name,
    job_id,
    job_name,
    log_date,
    check_in,
    check_out,
    hours_worked,
    overtime_hours,
    entry_type,
    daily_log_id,
    status,
    notes
  )
  VALUES (
    uid,
    ename,
    NEW.job_id,
    NEW.job_name,
    NEW.log_date,
    cin,
    cout,
    reg_h,
    COALESCE(ot_h, 0),
    'regular',
    NEW.id,
    'pending',
    NULL
  )
  ON CONFLICT (daily_log_id) WHERE (daily_log_id IS NOT NULL)
  DO UPDATE SET
    employee_id = EXCLUDED.employee_id,
    employee_name = EXCLUDED.employee_name,
    job_id = EXCLUDED.job_id,
    job_name = EXCLUDED.job_name,
    log_date = EXCLUDED.log_date,
    check_in = EXCLUDED.check_in,
    check_out = EXCLUDED.check_out,
    hours_worked = EXCLUDED.hours_worked,
    overtime_hours = EXCLUDED.overtime_hours,
    entry_type = EXCLUDED.entry_type;

  INSERT INTO public.work_calendar (
    calendar_date,
    employee_id,
    employee_name,
    event_type,
    job_id,
    job_name,
    check_in,
    check_out,
    hours,
    notes,
    source,
    reference_id
  )
  VALUES (
    NEW.log_date,
    uid,
    ename,
    'work',
    NEW.job_id,
    NEW.job_name,
    cin,
    cout,
    CASE
      WHEN total_hours IS NULL THEN NULL
      ELSE ROUND(total_hours::numeric, 2)
    END,
    NULL,
    'daily_log',
    NEW.id
  )
  ON CONFLICT (reference_id) WHERE (source = 'daily_log')
  DO UPDATE SET
    calendar_date = EXCLUDED.calendar_date,
    employee_id = EXCLUDED.employee_id,
    employee_name = EXCLUDED.employee_name,
    job_id = EXCLUDED.job_id,
    job_name = EXCLUDED.job_name,
    check_in = EXCLUDED.check_in,
    check_out = EXCLUDED.check_out,
    hours = EXCLUDED.hours,
    event_type = 'work';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_logs_sync_time ON public.daily_logs;
CREATE TRIGGER daily_logs_sync_time
  AFTER INSERT OR UPDATE OF check_in, check_out, crew_user, job_id, job_name, log_date
  ON public.daily_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_daily_log_to_time_tables();

-- ── 5) Approved time off → work_calendar ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_time_off_request_calendar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'approved'
     AND NEW.status = 'denied' THEN
    DELETE FROM public.work_calendar
    WHERE source = 'time_off' AND reference_id = NEW.id;
    RETURN NEW;
  END IF;

  IF NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.work_calendar
  WHERE source = 'time_off' AND reference_id = NEW.id;

  FOR rec IN
    SELECT gs::date AS d
    FROM generate_series(
      NEW.start_date::timestamp,
      NEW.end_date::timestamp,
      '1 day'::interval
    ) AS gs
  LOOP
    INSERT INTO public.work_calendar (
      calendar_date,
      employee_id,
      employee_name,
      event_type,
      job_id,
      job_name,
      check_in,
      check_out,
      hours,
      notes,
      source,
      reference_id
    )
    VALUES (
      rec.d,
      NEW.employee_id,
      NEW.employee_name,
      'time_off',
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      COALESCE(NEW.request_type::text || ' — ', '') || COALESCE(NEW.notes, ''),
      'time_off',
      NEW.id
    )
    ON CONFLICT (reference_id, calendar_date) WHERE (source = 'time_off')
    DO UPDATE SET
      employee_id = EXCLUDED.employee_id,
      employee_name = EXCLUDED.employee_name,
      notes = EXCLUDED.notes,
      event_type = 'time_off';
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS time_off_calendar_ins ON public.time_off_requests;
CREATE TRIGGER time_off_calendar_ins
  AFTER INSERT ON public.time_off_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_time_off_request_calendar();

DROP TRIGGER IF EXISTS time_off_calendar_upd ON public.time_off_requests;
CREATE TRIGGER time_off_calendar_upd
  AFTER UPDATE OF status, start_date, end_date, employee_id, employee_name, request_type, notes
  ON public.time_off_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_time_off_request_calendar();

-- ── 6) RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_calendar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timesheets_select_auth" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_insert_auth" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_update_auth" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_update_manager" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_update_own_pending" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_delete_auth" ON public.timesheets;

CREATE POLICY "timesheets_select_auth"
  ON public.timesheets FOR SELECT TO authenticated
  USING (
    public.app_user_is_active()
    AND (
      employee_id = auth.uid()
      OR public.app_user_role() IN (
        'super_admin',
        'admin',
        'office_manager',
        'estimator'
      )
      OR (
        employee_id IS NULL
        AND public.app_user_role() IN (
          'super_admin',
          'admin',
          'office_manager'
        )
      )
    )
  );

CREATE POLICY "timesheets_insert_auth"
  ON public.timesheets FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND (
      employee_id IS NULL
      OR employee_id = auth.uid()
      OR public.app_user_role() IN ('super_admin', 'admin', 'office_manager')
    )
  );

CREATE POLICY "timesheets_update_manager"
  ON public.timesheets FOR UPDATE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN ('super_admin', 'admin', 'office_manager')
  )
  WITH CHECK (public.app_user_is_active());

CREATE POLICY "timesheets_update_own_pending"
  ON public.timesheets FOR UPDATE TO authenticated
  USING (
    public.app_user_is_active()
    AND employee_id = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    public.app_user_is_active()
    AND employee_id = auth.uid()
    AND status = 'pending'
  );

CREATE POLICY "timesheets_delete_auth"
  ON public.timesheets FOR DELETE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN ('super_admin', 'admin', 'office_manager')
  );

DROP POLICY IF EXISTS "time_off_select_auth" ON public.time_off_requests;
DROP POLICY IF EXISTS "time_off_insert_auth" ON public.time_off_requests;
DROP POLICY IF EXISTS "time_off_update_auth" ON public.time_off_requests;
DROP POLICY IF EXISTS "time_off_update_manager" ON public.time_off_requests;
DROP POLICY IF EXISTS "time_off_update_own_pending" ON public.time_off_requests;
DROP POLICY IF EXISTS "time_off_delete_auth" ON public.time_off_requests;

CREATE POLICY "time_off_select_auth"
  ON public.time_off_requests FOR SELECT TO authenticated
  USING (
    public.app_user_is_active()
    AND (
      employee_id = auth.uid()
      OR public.app_user_role() IN (
        'super_admin',
        'admin',
        'office_manager',
        'estimator'
      )
    )
  );

CREATE POLICY "time_off_insert_auth"
  ON public.time_off_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND employee_id = auth.uid()
  );

CREATE POLICY "time_off_update_manager"
  ON public.time_off_requests FOR UPDATE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN ('super_admin', 'admin', 'office_manager')
  )
  WITH CHECK (public.app_user_is_active());

CREATE POLICY "time_off_update_own_pending"
  ON public.time_off_requests FOR UPDATE TO authenticated
  USING (
    public.app_user_is_active()
    AND employee_id = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    public.app_user_is_active()
    AND employee_id = auth.uid()
    AND status = 'pending'
  );

CREATE POLICY "time_off_delete_auth"
  ON public.time_off_requests FOR DELETE TO authenticated
  USING (
    public.app_user_is_active()
    AND employee_id = auth.uid()
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "work_calendar_select_auth" ON public.work_calendar;
DROP POLICY IF EXISTS "work_calendar_insert_auth" ON public.work_calendar;
DROP POLICY IF EXISTS "work_calendar_update_auth" ON public.work_calendar;
DROP POLICY IF EXISTS "work_calendar_delete_auth" ON public.work_calendar;

CREATE POLICY "work_calendar_select_auth"
  ON public.work_calendar FOR SELECT TO authenticated
  USING (public.app_user_is_active());

CREATE POLICY "work_calendar_insert_auth"
  ON public.work_calendar FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() IN ('super_admin', 'admin', 'office_manager')
    AND source = 'manual'
  );

CREATE POLICY "work_calendar_update_auth"
  ON public.work_calendar FOR UPDATE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN ('super_admin', 'admin', 'office_manager')
    AND source = 'manual'
  )
  WITH CHECK (
    public.app_user_is_active()
    AND source = 'manual'
  );

CREATE POLICY "work_calendar_delete_auth"
  ON public.work_calendar FOR DELETE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN ('super_admin', 'admin', 'office_manager')
    AND source = 'manual'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timesheets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_off_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_calendar TO authenticated;

-- Optional: Dashboard → Database → Replication → add `time_off_requests` for Realtime
-- so employees receive instant updates (toast) when a request is approved or denied.
