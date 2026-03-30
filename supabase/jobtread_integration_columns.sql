-- Columns and indexes for JobTread → Supabase customer/job import.
-- Run in Supabase SQL editor before using customer/job sync (upsert on jobtread_id).

alter table public.customers add column if not exists jobtread_id text;
alter table public.customers add column if not exists updated_at timestamptz not null default now();

create unique index if not exists customers_jobtread_id_key
  on public.customers (jobtread_id)
  where jobtread_id is not null;

create index if not exists customers_jobtread_id_idx
  on public.customers (jobtread_id);

alter table public.jobs add column if not exists jobtread_id text;

-- Partial unique index (legacy). If upsert fails or you prefer a table constraint,
-- run supabase/jobs_jobtread_id_unique.sql in the SQL editor.
create unique index if not exists jobs_jobtread_id_key
  on public.jobs (jobtread_id)
  where jobtread_id is not null;

create index if not exists jobs_jobtread_id_idx
  on public.jobs (jobtread_id);
