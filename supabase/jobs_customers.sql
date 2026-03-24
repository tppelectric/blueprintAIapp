-- Jobs & customers (Blueprint AI). Run in Supabase SQL editor.
-- Adjust RLS to match your security model (open policies mirror other tool tables).

-- ── Customers ─────────────────────────────────────────────────────────────
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_name text,
  contact_name text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists customers_created_at_idx
  on public.customers (created_at desc);

comment on table public.customers is 'Customers for job tracking (Blueprint AI).';

alter table public.customers enable row level security;

drop policy if exists "customers_select_all" on public.customers;
create policy "customers_select_all"
  on public.customers for select using (true);
drop policy if exists "customers_insert_all" on public.customers;
create policy "customers_insert_all"
  on public.customers for insert with check (true);
drop policy if exists "customers_update_all" on public.customers;
create policy "customers_update_all"
  on public.customers for update using (true) with check (true);
drop policy if exists "customers_delete_all" on public.customers;
create policy "customers_delete_all"
  on public.customers for delete using (true);

-- ── Jobs ───────────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  job_name text not null default '',
  job_number text not null default '',
  job_type text not null default 'Electrical',
  status text not null default 'Lead',
  address text,
  city text,
  state text,
  zip text,
  description text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_updated_at_idx on public.jobs (updated_at desc);

comment on table public.jobs is 'Jobs linked to customers and tool outputs.';

create or replace function public.jobs_set_number_and_touch()
returns trigger
language plpgsql
as $$
begin
  if NEW.job_number is null or trim(NEW.job_number) = '' then
    NEW.job_number := 'JOB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists jobs_before_insert on public.jobs;
create trigger jobs_before_insert
  before insert on public.jobs
  for each row execute function public.jobs_set_number_and_touch();

create or replace function public.jobs_touch_updated()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists jobs_before_update on public.jobs;
create trigger jobs_before_update
  before update on public.jobs
  for each row execute function public.jobs_touch_updated();

alter table public.jobs enable row level security;

drop policy if exists "jobs_select_all" on public.jobs;
create policy "jobs_select_all" on public.jobs for select using (true);
drop policy if exists "jobs_insert_all" on public.jobs;
create policy "jobs_insert_all" on public.jobs for insert with check (true);
drop policy if exists "jobs_update_all" on public.jobs;
create policy "jobs_update_all" on public.jobs for update using (true) with check (true);
drop policy if exists "jobs_delete_all" on public.jobs;
create policy "jobs_delete_all" on public.jobs for delete using (true);

-- ── Job attachments (link tool records to jobs) ───────────────────────────
create table if not exists public.job_attachments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  attachment_type text not null,
  attachment_id uuid not null,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists job_attachments_job_idx
  on public.job_attachments (job_id);

comment on table public.job_attachments is 'Links blueprint projects, Wi-Fi runs, breakdowns, etc. to jobs.';

alter table public.job_attachments enable row level security;

drop policy if exists "job_attachments_select_all" on public.job_attachments;
create policy "job_attachments_select_all"
  on public.job_attachments for select using (true);
drop policy if exists "job_attachments_insert_all" on public.job_attachments;
create policy "job_attachments_insert_all"
  on public.job_attachments for insert with check (true);
drop policy if exists "job_attachments_delete_all" on public.job_attachments;
create policy "job_attachments_delete_all"
  on public.job_attachments for delete using (true);

-- ── Saved project breakdowns (standalone tool) ─────────────────────────────
create table if not exists public.project_breakdowns (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Project breakdown',
  state_json jsonb not null default '{}'::jsonb,
  job_id uuid references public.jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_breakdowns_created_at_idx
  on public.project_breakdowns (created_at desc);

comment on table public.project_breakdowns is 'Standalone project breakdown editor state.';

alter table public.project_breakdowns enable row level security;

drop policy if exists "project_breakdowns_select_all" on public.project_breakdowns;
create policy "project_breakdowns_select_all"
  on public.project_breakdowns for select using (true);
drop policy if exists "project_breakdowns_insert_all" on public.project_breakdowns;
create policy "project_breakdowns_insert_all"
  on public.project_breakdowns for insert with check (true);
drop policy if exists "project_breakdowns_update_all" on public.project_breakdowns;
create policy "project_breakdowns_update_all"
  on public.project_breakdowns for update using (true) with check (true);
drop policy if exists "project_breakdowns_delete_all" on public.project_breakdowns;
create policy "project_breakdowns_delete_all"
  on public.project_breakdowns for delete using (true);

create or replace function public.project_breakdowns_touch()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists project_breakdowns_before_update on public.project_breakdowns;
create trigger project_breakdowns_before_update
  before update on public.project_breakdowns
  for each row execute function public.project_breakdowns_touch();
