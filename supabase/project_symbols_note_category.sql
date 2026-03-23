-- Run in Supabase → SQL Editor (after project_symbols exists)
-- Legend scan rows: electrical symbols vs plan note categories

alter table public.project_symbols
  add column if not exists note_category text;

comment on column public.project_symbols.note_category is
  'symbol | electrical_note | general_note | other_trade_note';

-- Optional: constrain allowed values (uncomment if you want strict CHECK)
-- alter table public.project_symbols drop constraint if exists project_symbols_note_category_check;
-- alter table public.project_symbols add constraint project_symbols_note_category_check
--   check (note_category is null or note_category in (
--     'symbol', 'electrical_note', 'general_note', 'other_trade_note'
--   ));
