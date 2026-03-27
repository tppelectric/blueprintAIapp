-- Ensure authenticated users can insert/select daily_logs via PostgREST (RLS still applies).
-- Run if daily log save fails with "permission denied" even when RLS policies exist.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_logs TO service_role;
