-- Run in Supabase → SQL Editor
-- Badge for user-corrected symbol rows

alter table public.electrical_items
  add column if not exists user_edited boolean not null default false;

comment on column public.electrical_items.user_edited is 'True if description/category was corrected by user';
