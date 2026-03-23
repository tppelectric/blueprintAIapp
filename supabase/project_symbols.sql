-- Run in Supabase → SQL Editor
-- Legend / symbol key entries extracted per project (Claude vision)

create table if not exists public.project_symbols (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  symbol_description text not null,
  symbol_category text not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  source_page integer not null check (source_page >= 1),
  user_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists project_symbols_project_id_idx
  on public.project_symbols (project_id);

create index if not exists project_symbols_project_page_idx
  on public.project_symbols (project_id, source_page);

comment on table public.project_symbols is 'Electrical legend/symbol key lines detected from blueprint pages';

-- RLS (adjust for production auth as needed)
alter table public.project_symbols enable row level security;

drop policy if exists "symbols_select_all" on public.project_symbols;
create policy "symbols_select_all"
  on public.project_symbols
  for select using (true);

drop policy if exists "symbols_insert_all" on public.project_symbols;
create policy "symbols_insert_all"
  on public.project_symbols
  for insert with check (true);

drop policy if exists "symbols_update_all" on public.project_symbols;
create policy "symbols_update_all"
  on public.project_symbols
  for update using (true) with check (true);
