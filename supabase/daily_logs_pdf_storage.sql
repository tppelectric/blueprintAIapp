-- Daily log PDF archive (Supabase Storage + column). Run after daily_logs.sql.

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT;

COMMENT ON COLUMN public.daily_logs.pdf_storage_path IS
  'Object path in daily-log-pdfs bucket (e.g. daily-logs/<job_id>/<date>-<log_id>.pdf).';

INSERT INTO storage.buckets (id, name, public)
VALUES ('daily-log-pdfs', 'daily-log-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Uploads and signed URLs use the service role in API routes (bypasses storage RLS).
