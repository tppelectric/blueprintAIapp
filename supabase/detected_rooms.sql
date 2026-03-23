-- Run in Supabase → SQL Editor
-- Room labels from Claude blueprint analysis

create table if not exists public.detected_rooms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  room_name text not null,
  room_type text not null,
  width_ft numeric,
  length_ft numeric,
  sq_ft numeric,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);

create index if not exists detected_rooms_project_id_idx
  on public.detected_rooms (project_id);

create index if not exists detected_rooms_project_page_idx
  on public.detected_rooms (project_id, page_number);

comment on table public.detected_rooms is 'Rooms/areas detected on each blueprint page';
