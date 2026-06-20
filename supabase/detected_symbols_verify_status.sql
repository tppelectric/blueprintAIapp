-- Phase 1: human symbol verification on electrical takeoff line items.
-- Run in Supabase → SQL Editor. Table: public.electrical_items

alter table public.electrical_items
  add column if not exists verified_status text not null default 'unverified',
  add column if not exists verified_user_id uuid references auth.users (id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists origin_source text not null default 'ai';

alter table public.electrical_items
  drop constraint if exists electrical_items_verified_status_chk;

alter table public.electrical_items
  add constraint electrical_items_verified_status_chk
  check (verified_status in ('unverified', 'accepted', 'edited', 'removed', 'manual'));

alter table public.electrical_items
  drop constraint if exists electrical_items_origin_source_chk;

alter table public.electrical_items
  add constraint electrical_items_origin_source_chk
  check (origin_source in ('ai', 'manual'));

create index if not exists electrical_items_verified_status_idx
  on public.electrical_items (project_id, verified_status);

comment on column public.electrical_items.verified_status is
  'Human symbol verify: unverified | accepted | edited | removed | manual';

comment on column public.electrical_items.verified_user_id is
  'auth.users id of last human verify action (distinct from legacy verified_by action channel)';

comment on column public.electrical_items.verified_at is
  'When verified_status was last set by a human';

comment on column public.electrical_items.origin_source is
  'How row entered takeoff: ai (scan) | manual (user-added later)';

comment on column public.electrical_items.instance_locations is
  'Array of {nx, ny, verified_status?, source?} per symbol. Missing fields default on read.';
