-- JobTread location display name (from location.name on sync).
-- Mirror of supabase/jobs_location_name.sql for migration tracking.

alter table public.jobs
  add column if not exists location_name text;

comment on column public.jobs.location_name is
  'JobTread location name (location.name); populated on jobs sync.';
