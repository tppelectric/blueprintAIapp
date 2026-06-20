-- Per-symbol normalized coordinates for takeoff overlay (0–1, top-left origin).
-- Run in Supabase → SQL Editor before relying on instance_locations in new scans.

alter table public.electrical_items
  add column if not exists instance_locations jsonb;

comment on column public.electrical_items.instance_locations is
  'Array of {nx, ny} per physical symbol instance. Null = legacy single centroid (location_nx/ny only).';
