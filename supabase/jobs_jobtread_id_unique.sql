-- Run in Supabase SQL editor if job upsert fails on duplicate jobtread_id partial index.
-- Matches the pattern used for customers: single UNIQUE on jobtread_id (multiple NULLs allowed in PostgreSQL).

drop index if exists public.jobs_jobtread_id_key;
drop index if exists public.jobs_jobtread_id_idx;

alter table public.jobs
  drop constraint if exists jobs_jobtread_id_unique;

alter table public.jobs
  add constraint jobs_jobtread_id_unique unique (jobtread_id);
