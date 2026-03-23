-- Run in Supabase → SQL Editor
-- Logs estimator corrections to description / category

create table if not exists public.symbol_corrections (
  id uuid primary key default gen_random_uuid(),
  original_description text not null,
  corrected_description text not null,
  original_category text not null,
  corrected_category text not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  created_at timestamptz not null default now()
);

create index if not exists symbol_corrections_project_id_idx
  on public.symbol_corrections (project_id);

create index if not exists symbol_corrections_project_page_idx
  on public.symbol_corrections (project_id, page_number);

comment on table public.symbol_corrections is 'User corrections to AI electrical item description/category';
