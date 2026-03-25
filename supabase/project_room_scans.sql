-- Run in Supabase → SQL Editor
-- History of room-only blueprint scans (sq ft, floor count)

create table if not exists public.project_room_scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  rooms_json jsonb not null default '[]'::jsonb,
  total_sqft numeric not null default 0 check (total_sqft >= 0),
  floor_count integer not null default 1 check (floor_count >= 1 and floor_count <= 99),
  scan_page integer not null check (scan_page >= 1),
  scan_label text not null,
  created_at timestamptz not null default now()
);

create index if not exists project_room_scans_project_id_idx
  on public.project_room_scans (project_id);

create index if not exists project_room_scans_created_idx
  on public.project_room_scans (project_id, created_at desc);

comment on table public.project_room_scans is 'Snapshots of room/sq-ft scans per blueprint page';

alter table public.project_room_scans enable row level security;

drop policy if exists "project_room_scans_select_all" on public.project_room_scans;
create policy "project_room_scans_select_all"
  on public.project_room_scans
  for select using (true);

drop policy if exists "project_room_scans_insert_all" on public.project_room_scans;
create policy "project_room_scans_insert_all"
  on public.project_room_scans
  for insert with check (true);

drop policy if exists "project_room_scans_update_all" on public.project_room_scans;
create policy "project_room_scans_update_all"
  on public.project_room_scans
  for update using (true) with check (true);

drop policy if exists "project_room_scans_delete_all" on public.project_room_scans;
create policy "project_room_scans_delete_all"
  on public.project_room_scans
  for delete using (true);
