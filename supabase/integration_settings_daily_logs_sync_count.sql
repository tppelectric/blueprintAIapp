-- Cumulative count from last successful JobTread daily_logs import sync.
-- Run in Supabase SQL editor after public.integration_settings exists.

ALTER TABLE public.integration_settings
  ADD COLUMN IF NOT EXISTS daily_logs_synced_count integer NOT NULL DEFAULT 0;
