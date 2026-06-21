-- JobTread location display name (from location.name on sync).
-- Run in Supabase SQL Editor.

alter table public.jobs
  add column if not exists location_name text;

comment on column public.jobs.location_name is
  'JobTread location name (location.name); populated on jobs sync.';
