-- Receipt capture (job-receipts storage + receipts table). Run after jobs, daily_logs, user_profiles, app_user_is_active.

CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs (id) ON DELETE SET NULL,
  daily_log_id UUID REFERENCES public.daily_logs (id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  vendor_name TEXT,
  receipt_date DATE,
  subtotal NUMERIC(12, 2),
  tax_amount NUMERIC(12, 2),
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  card_last_four TEXT,
  card_type TEXT,
  receipt_category TEXT NOT NULL DEFAULT 'Other',
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC(5, 2),
  notes TEXT,
  scan_raw JSONB
);

CREATE INDEX IF NOT EXISTS receipts_job_id_idx ON public.receipts (job_id);
CREATE INDEX IF NOT EXISTS receipts_daily_log_id_idx ON public.receipts (daily_log_id);
CREATE INDEX IF NOT EXISTS receipts_uploaded_by_idx ON public.receipts (uploaded_by);
CREATE INDEX IF NOT EXISTS receipts_created_at_idx ON public.receipts (created_at DESC);
CREATE INDEX IF NOT EXISTS receipts_unassigned_idx ON public.receipts (created_at DESC) WHERE job_id IS NULL;

COMMENT ON TABLE public.receipts IS 'Field receipt images with AI-extracted metadata; files in job-receipts bucket.';

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipts_select_auth" ON public.receipts;
DROP POLICY IF EXISTS "receipts_insert_auth" ON public.receipts;
DROP POLICY IF EXISTS "receipts_update_auth" ON public.receipts;
DROP POLICY IF EXISTS "receipts_delete_auth" ON public.receipts;

CREATE POLICY "receipts_select_auth"
  ON public.receipts FOR SELECT TO authenticated
  USING (public.app_user_is_active());

CREATE POLICY "receipts_insert_auth"
  ON public.receipts FOR INSERT TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "receipts_update_auth"
  ON public.receipts FOR UPDATE TO authenticated
  USING (
    public.app_user_is_active()
    AND (
      uploaded_by = auth.uid()
      OR public.app_user_role() IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (public.app_user_is_active());

CREATE POLICY "receipts_delete_auth"
  ON public.receipts FOR DELETE TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN ('super_admin', 'admin')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-receipts', 'job-receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "job_receipts_storage_insert" ON storage.objects;
CREATE POLICY "job_receipts_storage_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'job-receipts'
  AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/'
);

DROP POLICY IF EXISTS "job_receipts_storage_select" ON storage.objects;
CREATE POLICY "job_receipts_storage_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'job-receipts');

DROP POLICY IF EXISTS "job_receipts_storage_delete" ON storage.objects;
CREATE POLICY "job_receipts_storage_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'job-receipts'
  AND public.app_user_role() IN ('super_admin', 'admin')
);
