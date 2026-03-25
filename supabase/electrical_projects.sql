-- Electrical Project Analyzer saved plans. Run in Supabase SQL editor.

create table if not exists public.electrical_projects (
  id uuid primary key default gen_random_uuid(),
  project_name text not null default '',
  client_name text not null default '',
  building_type text not null default '',
  project_id uuid references public.projects (id) on delete set null,
  inputs_json jsonb not null default '{}'::jsonb,
  results_json jsonb not null default '{}'::jsonb,
  circuits_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists electrical_projects_created_at_idx
  on public.electrical_projects (created_at desc);

comment on table public.electrical_projects is 'Saved Electrical Project Analyzer runs (room-by-room takeoff, Blueprint AI).';

alter table public.electrical_projects enable row level security;

drop policy if exists "electrical_projects_select_all" on public.electrical_projects;
create policy "electrical_projects_select_all"
  on public.electrical_projects for select using (true);

drop policy if exists "electrical_projects_insert_all" on public.electrical_projects;
create policy "electrical_projects_insert_all"
  on public.electrical_projects for insert with check (true);

drop policy if exists "electrical_projects_update_all" on public.electrical_projects;
create policy "electrical_projects_update_all"
  on public.electrical_projects for update using (true) with check (true);

drop policy if exists "electrical_projects_delete_all" on public.electrical_projects;
create policy "electrical_projects_delete_all"
  on public.electrical_projects for delete using (true);
