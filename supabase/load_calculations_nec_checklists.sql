-- Standalone tools: load calculator saves + NEC checklist saves.
-- Run in Supabase SQL editor. Adjust RLS to match your security model.

-- ── Load calculations (residential / commercial) ───────────────────────────
create table if not exists public.load_calculations (
  id uuid primary key default gen_random_uuid(),
  project_name text not null default '',
  building_type text not null default 'residential',
  inputs_json jsonb not null default '{}'::jsonb,
  results_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists load_calculations_created_at_idx
  on public.load_calculations (created_at desc);

comment on table public.load_calculations is 'Saved NEC Article 220 load calculator runs (standalone tool).';

alter table public.load_calculations enable row level security;

drop policy if exists "load_calculations_select_all" on public.load_calculations;
create policy "load_calculations_select_all"
  on public.load_calculations for select using (true);

drop policy if exists "load_calculations_insert_all" on public.load_calculations;
create policy "load_calculations_insert_all"
  on public.load_calculations for insert with check (true);

drop policy if exists "load_calculations_update_all" on public.load_calculations;
create policy "load_calculations_update_all"
  on public.load_calculations for update using (true) with check (true);

drop policy if exists "load_calculations_delete_all" on public.load_calculations;
create policy "load_calculations_delete_all"
  on public.load_calculations for delete using (true);

-- ── NEC checklists ─────────────────────────────────────────────────────────
create table if not exists public.nec_checklists (
  id uuid primary key default gen_random_uuid(),
  project_name text not null default '',
  jurisdiction text not null default 'NY',
  permit_date date,
  nec_edition text not null default '2023',
  occupancy_type text not null default 'Residential',
  answers_json jsonb not null default '{}'::jsonb,
  violations_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists nec_checklists_created_at_idx
  on public.nec_checklists (created_at desc);

comment on table public.nec_checklists is 'Saved NEC 2023 checklist runs (standalone tool).';

alter table public.nec_checklists enable row level security;

drop policy if exists "nec_checklists_select_all" on public.nec_checklists;
create policy "nec_checklists_select_all"
  on public.nec_checklists for select using (true);

drop policy if exists "nec_checklists_insert_all" on public.nec_checklists;
create policy "nec_checklists_insert_all"
  on public.nec_checklists for insert with check (true);

drop policy if exists "nec_checklists_update_all" on public.nec_checklists;
create policy "nec_checklists_update_all"
  on public.nec_checklists for update using (true) with check (true);

drop policy if exists "nec_checklists_delete_all" on public.nec_checklists;
create policy "nec_checklists_delete_all"
  on public.nec_checklists for delete using (true);

-- ── NEC AI questions (/api/nec-question) ───────────────────────────────────
-- Inserts use service role (bypass RLS). Optional SELECT for admin dashboards.

create table if not exists public.nec_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text,
  jurisdiction text default 'NY',
  nec_edition text default '2023',
  created_at timestamptz not null default now()
);

create index if not exists nec_questions_created_at_idx
  on public.nec_questions (created_at desc);

comment on table public.nec_questions is 'Claude NEC Q&A from standalone NEC checker tool.';

alter table public.nec_questions enable row level security;

drop policy if exists "nec_questions_select_all" on public.nec_questions;
create policy "nec_questions_select_all"
  on public.nec_questions for select using (true);
