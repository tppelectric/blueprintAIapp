-- Wi-Fi Analyzer saved runs (standalone tool). Run in Supabase SQL editor.

create table if not exists public.wifi_calculations (
  id uuid primary key default gen_random_uuid(),
  project_name text not null default '',
  building_type text not null default '',
  inputs_json jsonb not null default '{}'::jsonb,
  results_json jsonb not null default '{}'::jsonb,
  equipment_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wifi_calculations_created_at_idx
  on public.wifi_calculations (created_at desc);

comment on table public.wifi_calculations is 'Saved Wi-Fi coverage planner runs (Blueprint AI tool).';

alter table public.wifi_calculations enable row level security;

drop policy if exists "wifi_calculations_select_all" on public.wifi_calculations;
create policy "wifi_calculations_select_all"
  on public.wifi_calculations for select using (true);

drop policy if exists "wifi_calculations_insert_all" on public.wifi_calculations;
create policy "wifi_calculations_insert_all"
  on public.wifi_calculations for insert with check (true);

drop policy if exists "wifi_calculations_update_all" on public.wifi_calculations;
create policy "wifi_calculations_update_all"
  on public.wifi_calculations for update using (true) with check (true);

drop policy if exists "wifi_calculations_delete_all" on public.wifi_calculations;
create policy "wifi_calculations_delete_all"
  on public.wifi_calculations for delete using (true);
