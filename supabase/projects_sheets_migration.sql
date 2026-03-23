-- Run in Supabase SQL Editor (or via migration tooling).
-- Multi-sheet projects: project metadata + per-PDF rows.

-- 1) Projects: display name and sheet count
alter table public.projects
  add column if not exists project_name text;

alter table public.projects
  add column if not exists sheet_count integer not null default 1;

-- Backfill legacy rows
update public.projects
set
  project_name = coalesce(
    nullif(trim(project_name), ''),
    trim(regexp_replace(file_name, '\.pdf$', '', 'i')),
    file_name
  )
where project_name is null or trim(project_name) = '';

update public.projects
set sheet_count = greatest(sheet_count, 1)
where sheet_count is null or sheet_count < 1;

-- 2) Sheets: one row per uploaded PDF
create table if not exists public.sheets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  sheet_name text not null,
  file_url text not null,
  file_size bigint not null,
  page_count integer,
  sheet_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sheets_project_order_idx
  on public.sheets (project_id, sheet_order);

-- 3) One sheet row per existing project (so the viewer uses the sheets table)
insert into public.sheets (project_id, sheet_name, file_url, file_size, sheet_order, page_count)
select
  p.id,
  trim(regexp_replace(p.file_name, '\.pdf$', '', 'i')),
  p.file_url,
  p.file_size,
  0,
  null
from public.projects p
where not exists (select 1 from public.sheets s where s.project_id = p.id);

update public.projects p
set sheet_count = (select count(*)::integer from public.sheets s where s.project_id = p.id)
where exists (select 1 from public.sheets s where s.project_id = p.id);

-- 4) RLS — tune to match your `projects` policies (example: open demo)
alter table public.sheets enable row level security;

drop policy if exists "sheets_select_all" on public.sheets;
drop policy if exists "sheets_insert_all" on public.sheets;
drop policy if exists "sheets_update_all" on public.sheets;
drop policy if exists "sheets_delete_all" on public.sheets;

create policy "sheets_select_all" on public.sheets
  for select using (true);

create policy "sheets_insert_all" on public.sheets
  for insert with check (true);

create policy "sheets_update_all" on public.sheets
  for update using (true) with check (true);

create policy "sheets_delete_all" on public.sheets
  for delete using (true);
