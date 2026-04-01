-- Unique JobTread daily log id for upsert sync (nullable jobtread_id allowed for manual logs).
-- Run in Supabase SQL editor after public.daily_logs exists.

CREATE UNIQUE INDEX IF NOT EXISTS daily_logs_jobtread_id_key
  ON public.daily_logs (jobtread_id)
  WHERE jobtread_id IS NOT NULL;
