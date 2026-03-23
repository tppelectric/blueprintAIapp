-- Run in Supabase → SQL Editor (adds verification + manual count columns)

alter table public.electrical_items
  add column if not exists gpt_count integer,
  add column if not exists final_count integer,
  add column if not exists verification_status text default 'pending',
  add column if not exists verified_by text;

comment on column public.electrical_items.gpt_count is 'GPT-4o recount for this line / description group';
comment on column public.electrical_items.final_count is 'Estimator-approved or verified quantity';
comment on column public.electrical_items.verification_status is 'pending | confirmed | review_needed | conflict | manual';
comment on column public.electrical_items.verified_by is 'auto | manual';
