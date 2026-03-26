-- Extended daily log fields + attachments. Run after daily_logs.sql.

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS weather TEXT;

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS lunch_duration_minutes INTEGER;

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS equipment_used TEXT;

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS work_completed TEXT;

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS next_day_plan TEXT;

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS safety_incident BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS safety_incident_notes TEXT;

CREATE TABLE IF NOT EXISTS public.daily_log_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_log_id UUID NOT NULL REFERENCES public.daily_logs (id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'document')),
  category TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS daily_log_attachments_log_idx
  ON public.daily_log_attachments (daily_log_id);

ALTER TABLE public.daily_log_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_log_attachments_select" ON public.daily_log_attachments;
CREATE POLICY "daily_log_attachments_select"
  ON public.daily_log_attachments FOR SELECT TO authenticated
  USING (public.app_user_is_active());

DROP POLICY IF EXISTS "daily_log_attachments_insert" ON public.daily_log_attachments;
CREATE POLICY "daily_log_attachments_insert"
  ON public.daily_log_attachments FOR INSERT TO authenticated
  WITH CHECK (public.app_user_is_active());

DROP POLICY IF EXISTS "daily_log_attachments_delete" ON public.daily_log_attachments;
CREATE POLICY "daily_log_attachments_delete"
  ON public.daily_log_attachments FOR DELETE TO authenticated
  USING (public.app_user_is_active());

GRANT SELECT, INSERT, DELETE ON public.daily_log_attachments TO authenticated;

-- Storage bucket (create in Dashboard if INSERT fails — then keep policies only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('daily-log-attachments', 'daily-log-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "daily_log_attachments_storage_insert" ON storage.objects;
CREATE POLICY "daily_log_attachments_storage_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'daily-log-attachments'
  AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
);

DROP POLICY IF EXISTS "daily_log_attachments_storage_select" ON storage.objects;
CREATE POLICY "daily_log_attachments_storage_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'daily-log-attachments');

DROP POLICY IF EXISTS "daily_log_attachments_storage_delete" ON storage.objects;
CREATE POLICY "daily_log_attachments_storage_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'daily-log-attachments');
