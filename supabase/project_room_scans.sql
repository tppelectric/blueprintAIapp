-- Room scan persistence + history (floor-plan fields + analyze-rooms snapshots).
-- Run in Supabase SQL Editor. For existing tables, add missing columns via ALTER.

create table if not exists public.project_room_scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  scan_page int not null default 1 check (scan_page >= 1),
  rooms_json jsonb not null default '[]'::jsonb,
  equipment_suggestions_json jsonb not null default '[]'::jsonb,
  scan_notes text not null default '',
  total_sqft numeric null check (total_sqft is null or total_sqft >= 0),
  floor_count int null check (
    floor_count is null or (floor_count >= 1 and floor_count <= 99)
  ),
  scan_label text not null default ''
);

create index if not exists project_room_scans_project_id_idx
  on public.project_room_scans (project_id);

create index if not exists project_room_scans_project_created_idx
  on public.project_room_scans (project_id, created_at desc);

comment on table public.project_room_scans is
  'Snapshots of room / sq-ft scans per blueprint page (library + electrical takeoff recall)';

alter table public.project_room_scans enable row level security;

drop policy if exists "project_room_scans_select_all" on public.project_room_scans;
drop policy if exists "project_room_scans_insert_all" on public.project_room_scans;
drop policy if exists "project_room_scans_update_all" on public.project_room_scans;
drop policy if exists "project_room_scans_delete_all" on public.project_room_scans;
drop policy if exists "project_room_scans_select_auth" on public.project_room_scans;
drop policy if exists "project_room_scans_insert_auth" on public.project_room_scans;
drop policy if exists "project_room_scans_update_auth" on public.project_room_scans;
drop policy if exists "project_room_scans_delete_auth" on public.project_room_scans;

create policy "project_room_scans_select_auth" on public.project_room_scans
  for select to authenticated using (true);

create policy "project_room_scans_insert_auth" on public.project_room_scans
  for insert to authenticated with check (true);

create policy "project_room_scans_update_auth" on public.project_room_scans
  for update to authenticated using (true) with check (true);

create policy "project_room_scans_delete_auth" on public.project_room_scans
  for delete to authenticated using (true);
