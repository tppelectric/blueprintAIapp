-- Run in Supabase SQL Editor after reviewing RLS for your environment.
-- Per-page trade focus + notes for blueprint viewer (sheets = one uploaded PDF).

alter table public.sheets
  add column if not exists trade_designation jsonb not null default '{}'::jsonb;

comment on column public.sheets.trade_designation is
  'Map of global 1-based page index to trade slug, e.g. {"1":"electrical","2":"low_voltage"}';

alter table public.sheets
  add column if not exists page_notes jsonb not null default '{}'::jsonb;

comment on column public.sheets.page_notes is
  'Map of global 1-based page index to user note string';

-- Optional: GIN for querying by designation (if you filter in SQL later)
-- create index if not exists sheets_trade_designation_gin on public.sheets using gin (trade_designation);
