-- Run in Supabase → SQL Editor
-- Symbol capture from plans, match counts, library

-- Legend scan: symbol vs plan note rows (see also project_symbols_note_category.sql)
alter table public.project_symbols
  add column if not exists note_category text;

comment on column public.project_symbols.note_category is
  'symbol | electrical_note | general_note | other_trade_note';

-- Captured crop + bbox (normalized 0–1 on rendered page) + match metadata
alter table public.project_symbols
  add column if not exists symbol_image_base64 text,
  add column if not exists symbol_bbox jsonb,
  add column if not exists capture_page integer,
  add column if not exists capture_x_percent numeric,
  add column if not exists capture_y_percent numeric,
  add column if not exists capture_width_percent numeric,
  add column if not exists capture_height_percent numeric,
  add column if not exists match_count integer default 0,
  add column if not exists verified_by text default 'ai';

comment on column public.project_symbols.symbol_image_base64 is 'PNG base64 (no data URL prefix) cropped from blueprint';
comment on column public.project_symbols.symbol_bbox is 'JSON {nx,ny,nw,nh} normalized to rendered page box';
comment on column public.project_symbols.match_count is 'Aggregate count from symbol_page_matches (sum across pages)';

-- Per-page match clicks (dots in normalized coords)
create table if not exists public.symbol_page_matches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  project_symbol_id uuid not null references public.project_symbols (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  dots jsonb not null default '[]'::jsonb,
  match_count integer not null default 0 check (match_count >= 0),
  room_scope text,
  verified_by text not null default 'symbol_match',
  created_at timestamptz not null default now(),
  unique (project_symbol_id, page_number)
);

create index if not exists symbol_page_matches_project_idx
  on public.symbol_page_matches (project_id);

create index if not exists symbol_page_matches_symbol_idx
  on public.symbol_page_matches (project_symbol_id);

comment on table public.symbol_page_matches is 'User click-match counts per legend symbol per page; dots [{nx,ny,n,room_name?}]';

alter table public.symbol_page_matches enable row level security;

drop policy if exists "spm_select_all" on public.symbol_page_matches;
create policy "spm_select_all"
  on public.symbol_page_matches for select using (true);

drop policy if exists "spm_insert_all" on public.symbol_page_matches;
create policy "spm_insert_all"
  on public.symbol_page_matches for insert with check (true);

drop policy if exists "spm_update_all" on public.symbol_page_matches;
create policy "spm_update_all"
  on public.symbol_page_matches for update using (true) with check (true);

drop policy if exists "spm_delete_all" on public.symbol_page_matches;
create policy "spm_delete_all"
  on public.symbol_page_matches for delete using (true);
