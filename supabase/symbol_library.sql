-- Run in Supabase → SQL Editor
-- Reusable symbols across projects

create table if not exists public.symbol_library (
  id uuid primary key default gen_random_uuid(),
  company_id text not null default 'tpp_electric',
  description text not null,
  category text not null,
  symbol_image_base64 text,
  usage_count integer not null default 0 check (usage_count >= 0),
  created_from_project uuid references public.projects (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists symbol_library_company_idx
  on public.symbol_library (company_id);

create index if not exists symbol_library_created_project_idx
  on public.symbol_library (created_from_project);

comment on table public.symbol_library is 'Cross-project reusable captured symbols';

-- Requires public.project_symbols to exist. Run after project_symbols base migration.
alter table public.project_symbols
  add column if not exists source_library_id uuid references public.symbol_library (id) on delete set null;

comment on column public.project_symbols.source_library_id is 'When row was created from symbol library import';

-- Track which projects imported each library symbol (for “appears in” on dashboard)
create table if not exists public.symbol_library_projects (
  library_id uuid not null references public.symbol_library (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (library_id, project_id)
);

create index if not exists symbol_library_projects_project_idx
  on public.symbol_library_projects (project_id);

alter table public.symbol_library_projects enable row level security;

drop policy if exists "slp_select_all" on public.symbol_library_projects;
create policy "slp_select_all"
  on public.symbol_library_projects for select using (true);

drop policy if exists "slp_insert_all" on public.symbol_library_projects;
create policy "slp_insert_all"
  on public.symbol_library_projects for insert with check (true);

alter table public.symbol_library enable row level security;

drop policy if exists "symlib_select_all" on public.symbol_library;
create policy "symlib_select_all"
  on public.symbol_library for select using (true);

drop policy if exists "symlib_insert_all" on public.symbol_library;
create policy "symlib_insert_all"
  on public.symbol_library for insert with check (true);

drop policy if exists "symlib_update_all" on public.symbol_library;
create policy "symlib_update_all"
  on public.symbol_library for update using (true) with check (true);

drop policy if exists "symlib_delete_all" on public.symbol_library;
create policy "symlib_delete_all"
  on public.symbol_library for delete using (true);
