-- Run in Supabase SQL editor if wifi_calculations already exists without project_id.

alter table public.wifi_calculations
  add column if not exists project_id uuid references public.projects (id) on delete set null;

create index if not exists wifi_calculations_project_id_idx
  on public.wifi_calculations (project_id);
