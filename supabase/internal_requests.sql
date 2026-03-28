-- ═══════════════════════════════════════════════════════════════════════════
-- Blueprint AI — Internal employee requests & ticketing
-- Run after public.jobs and public.assets exist. Uses auth.users.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.internal_request_counters (
  year INTEGER PRIMARY KEY,
  last_num INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.assign_internal_request_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y int;
  nextn int;
BEGIN
  IF NEW.request_number IS NOT NULL AND length(trim(NEW.request_number)) > 0 THEN
    RETURN NEW;
  END IF;
  y := EXTRACT(YEAR FROM (timezone('UTC', now())))::int;
  INSERT INTO public.internal_request_counters (year, last_num)
  VALUES (y, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_num = internal_request_counters.last_num + 1
  RETURNING last_num INTO nextn;
  NEW.request_number := 'REQ-' || y::text || '-' || lpad(nextn::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.internal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT UNIQUE,
  submitted_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  request_type TEXT NOT NULL
    CHECK (request_type IN (
      'vehicle_maintenance',
      'vehicle_request',
      'tool_repair',
      'material_order',
      'tool_request',
      'document_request',
      'license_request',
      'expense_reimbursement',
      'safety_incident',
      'hr_admin',
      'app_support',
      'other'
    )),
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'urgent', 'emergency')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN (
      'new',
      'in_review',
      'approved',
      'in_progress',
      'waiting',
      'completed',
      'declined',
      'cancelled'
    )),
  job_id UUID REFERENCES public.jobs (id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.assets (id) ON DELETE SET NULL,
  photos TEXT[] NOT NULL DEFAULT '{}',
  amount NUMERIC(10, 2),
  quantity INTEGER,
  item_description TEXT,
  date_needed DATE,
  admin_notes TEXT,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS internal_requests_submitted_idx
  ON public.internal_requests (submitted_by, created_at DESC);
CREATE INDEX IF NOT EXISTS internal_requests_status_idx
  ON public.internal_requests (status);
CREATE INDEX IF NOT EXISTS internal_requests_assigned_idx
  ON public.internal_requests (assigned_to);
CREATE INDEX IF NOT EXISTS internal_requests_type_idx
  ON public.internal_requests (request_type);
CREATE INDEX IF NOT EXISTS internal_requests_priority_idx
  ON public.internal_requests (priority);

DROP TRIGGER IF EXISTS internal_requests_number_trg ON public.internal_requests;
CREATE TRIGGER internal_requests_number_trg
  BEFORE INSERT ON public.internal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_internal_request_number();

CREATE OR REPLACE FUNCTION public.touch_internal_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_requests_updated_at_trg ON public.internal_requests;
CREATE TRIGGER internal_requests_updated_at_trg
  BEFORE UPDATE ON public.internal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_internal_requests_updated_at();

CREATE OR REPLACE FUNCTION public.restrict_internal_request_submitter_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_staff boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND COALESCE(p.is_active, true)
      AND p.role IN ('admin', 'super_admin', 'office_manager')
  ) INTO is_staff;

  IF OLD.submitted_by = auth.uid() AND NOT is_staff THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (OLD.status = 'new' AND NEW.status = 'cancelled') THEN
        RAISE EXCEPTION 'You may only cancel a request while it is still New';
      END IF;
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
      OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
      OR NEW.resolution_notes IS DISTINCT FROM OLD.resolution_notes
      OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
      OR NEW.request_number IS DISTINCT FROM OLD.request_number
    THEN
      RAISE EXCEPTION 'Not allowed to change administrative fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_requests_submitter_guard_trg ON public.internal_requests;
CREATE TRIGGER internal_requests_submitter_guard_trg
  BEFORE UPDATE ON public.internal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_internal_request_submitter_update();

CREATE TABLE IF NOT EXISTS public.internal_request_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.internal_requests (id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS internal_request_status_events_req_idx
  ON public.internal_request_status_events (request_id, created_at);

CREATE OR REPLACE FUNCTION public.log_internal_request_status_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.internal_request_status_events (request_id, status, created_by)
    VALUES (NEW.id, NEW.status, NEW.submitted_by);
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.internal_request_status_events (request_id, status, created_by)
    VALUES (NEW.id, NEW.status, auth.uid());
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS internal_requests_status_log_trg ON public.internal_requests;
CREATE TRIGGER internal_requests_status_log_trg
  AFTER INSERT OR UPDATE OF status ON public.internal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.log_internal_request_status_event();

CREATE TABLE IF NOT EXISTS public.request_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.internal_requests (id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  comment TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS request_comments_request_idx
  ON public.request_comments (request_id, created_at);

CREATE OR REPLACE FUNCTION public.enforce_request_comment_internal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_internal IS TRUE THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND p.role IN ('admin', 'super_admin')
    ) THEN
      RAISE EXCEPTION 'Only company admins can post internal comments';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS request_comments_internal_trg ON public.request_comments;
CREATE TRIGGER request_comments_internal_trg
  BEFORE INSERT OR UPDATE OF is_internal ON public.request_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_request_comment_internal();

INSERT INTO storage.buckets (id, name, public)
VALUES ('internal-request-files', 'internal-request-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "internal_request_files_authenticated" ON storage.objects;
CREATE POLICY "internal_request_files_authenticated"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'internal-request-files')
  WITH CHECK (bucket_id = 'internal-request-files');

ALTER TABLE public.internal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_request_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal_requests_select" ON public.internal_requests;
CREATE POLICY "internal_requests_select"
  ON public.internal_requests FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND p.role IN ('admin', 'super_admin', 'office_manager')
    )
  );

DROP POLICY IF EXISTS "internal_requests_insert" ON public.internal_requests;
CREATE POLICY "internal_requests_insert"
  ON public.internal_requests FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

DROP POLICY IF EXISTS "internal_requests_update" ON public.internal_requests;
CREATE POLICY "internal_requests_update"
  ON public.internal_requests FOR UPDATE TO authenticated
  USING (
    submitted_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND p.role IN ('admin', 'super_admin', 'office_manager')
    )
  )
  WITH CHECK (
    submitted_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND p.role IN ('admin', 'super_admin', 'office_manager')
    )
  );

DROP POLICY IF EXISTS "request_comments_select" ON public.request_comments;
CREATE POLICY "request_comments_select"
  ON public.request_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_requests r
      WHERE r.id = request_comments.request_id
        AND (
          r.submitted_by = auth.uid()
          OR r.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.user_profiles p
            WHERE p.id = auth.uid()
              AND COALESCE(p.is_active, true)
              AND p.role IN ('admin', 'super_admin', 'office_manager')
          )
        )
    )
    AND (
      NOT request_comments.is_internal
      OR EXISTS (
        SELECT 1 FROM public.user_profiles p
        WHERE p.id = auth.uid()
          AND COALESCE(p.is_active, true)
          AND p.role IN ('admin', 'super_admin')
      )
    )
  );

DROP POLICY IF EXISTS "request_comments_insert" ON public.request_comments;
CREATE POLICY "request_comments_insert"
  ON public.request_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.internal_requests r
      WHERE r.id = request_comments.request_id
        AND (
          r.submitted_by = auth.uid()
          OR r.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.user_profiles p
            WHERE p.id = auth.uid()
              AND COALESCE(p.is_active, true)
              AND p.role IN ('admin', 'super_admin', 'office_manager')
          )
        )
    )
  );

DROP POLICY IF EXISTS "status_events_select" ON public.internal_request_status_events;
CREATE POLICY "status_events_select"
  ON public.internal_request_status_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_requests r
      WHERE r.id = internal_request_status_events.request_id
        AND (
          r.submitted_by = auth.uid()
          OR r.assigned_to = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.user_profiles p
            WHERE p.id = auth.uid()
              AND COALESCE(p.is_active, true)
              AND p.role IN ('admin', 'super_admin', 'office_manager')
          )
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_requests TO authenticated;
GRANT SELECT, INSERT ON public.request_comments TO authenticated;
GRANT SELECT ON public.internal_request_status_events TO authenticated;

COMMENT ON TABLE public.internal_requests IS 'Employee-initiated internal requests (fleet, tools, HR, safety, etc.).';
COMMENT ON COLUMN public.internal_requests.details IS 'Type-specific JSON (vehicle_safe_to_drive, safety_where, etc.).';
