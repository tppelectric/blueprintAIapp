-- Room scan persistence (project viewer). Run in Supabase SQL Editor.

create table if not exists public.project_room_scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  scan_page int not null default 1,
  rooms_json jsonb not null default '[]'::jsonb,
  equipment_suggestions_json jsonb not null default '[]'::jsonb,
  scan_notes text not null default '',
  total_sqft int,
  floor_count int
);

create index if not exists project_room_scans_project_created_idx
  on public.project_room_scans (project_id, created_at desc);

alter table public.project_room_scans enable row level security;

drop policy if exists "project_room_scans_select_auth" on public.project_room_scans;
drop policy if exists "project_room_scans_insert_auth" on public.project_room_scans;
drop policy if exists "project_room_scans_delete_auth" on public.project_room_scans;

create policy "project_room_scans_select_auth" on public.project_room_scans
  for select to authenticated using (true);

create policy "project_room_scans_insert_auth" on public.project_room_scans
  for insert to authenticated with check (true);

create policy "project_room_scans_delete_auth" on public.project_room_scans
  for delete to authenticated using (true);
