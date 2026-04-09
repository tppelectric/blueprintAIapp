-- Normalized page coordinates for takeoff overlay (0–1), from Claude analyze-page.
alter table public.electrical_items
  add column if not exists location_nx double precision,
  add column if not exists location_ny double precision;

comment on column public.electrical_items.location_nx is '0=left, 1=right on blueprint page image';
comment on column public.electrical_items.location_ny is '0=top, 1=bottom on blueprint page image';
