-- Optional: persist scan mode label on each saved_scans row (matches analyze-page body.scanType).
-- Run in Supabase SQL Editor if the column is missing.

alter table public.saved_scans
  add column if not exists scan_mode text;

comment on column public.saved_scans.scan_mode is 'Scan mode / batch context from analyze-page (e.g. single, batch).';
