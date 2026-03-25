-- Run in Supabase → SQL Editor
-- Snapshots of per-page analysis runs

create table if not exists public.saved_scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  scan_name text not null,
  scan_date timestamptz not null default now(),
  items_snapshot jsonb not null default '[]'::jsonb,
  rooms_snapshot jsonb not null default '[]'::jsonb,
  total_items integer not null default 0 check (total_items >= 0),
  notes text,
  scan_mode text,
  scan_type text not null default 'electrical',
  plan_rooms_json jsonb,
  created_at timestamptz not null default now(),
  constraint saved_scans_scan_type_check check (
    scan_type in ('electrical', 'room', 'full', 'target')
  )
);

create index if not exists saved_scans_project_id_idx
  on public.saved_scans (project_id);

create index if not exists saved_scans_project_page_idx
  on public.saved_scans (project_id, page_number);

create index if not exists saved_scans_scan_date_idx
  on public.saved_scans (project_id, scan_date desc);

comment on table public.saved_scans is 'Named snapshots of electrical_items + detected_rooms for a page';

alter table public.saved_scans enable row level security;

drop policy if exists "saved_scans_select_all" on public.saved_scans;
create policy "saved_scans_select_all"
  on public.saved_scans
  for select using (true);

drop policy if exists "saved_scans_insert_all" on public.saved_scans;
create policy "saved_scans_insert_all"
  on public.saved_scans
  for insert with check (true);

drop policy if exists "saved_scans_update_all" on public.saved_scans;
create policy "saved_scans_update_all"
  on public.saved_scans
  for update using (true) with check (true);

drop policy if exists "saved_scans_delete_all" on public.saved_scans;
create policy "saved_scans_delete_all"
  on public.saved_scans
  for delete using (true);
