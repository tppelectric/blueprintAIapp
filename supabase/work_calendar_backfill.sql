-- One-time backfill: populate work_calendar + timesheets from existing daily_logs.
--
-- Why: the `daily_logs_sync_time` trigger (employee_time_management.sql) only
-- fires on new INSERT/UPDATE of daily_logs. Daily logs synced from JobTread
-- BEFORE that trigger existed never reached work_calendar, so the Work Calendar
-- and the per-employee month-view hours show nothing for historical data.
--
-- How: re-fire the trigger with a no-op UPDATE of log_date. Postgres fires an
-- "AFTER UPDATE OF <col>" trigger whenever that column appears in the SET list,
-- even if the value is unchanged. The trigger's upserts are idempotent
-- (ON CONFLICT on reference_id / daily_log_id), so this is safe to run more than
-- once. Restricted to logs that have both punch times (the only ones with hours).
--
-- Run in the Supabase SQL Editor.

UPDATE public.daily_logs
SET log_date = log_date
WHERE check_in IS NOT NULL
  AND check_out IS NOT NULL;

-- Sanity checks (optional — run as separate SELECTs after the UPDATE):
-- SELECT count(*) AS work_rows FROM public.work_calendar WHERE event_type = 'work';
-- SELECT calendar_date, employee_name, hours
--   FROM public.work_calendar
--   WHERE event_type = 'work'
--   ORDER BY calendar_date DESC
--   LIMIT 20;
