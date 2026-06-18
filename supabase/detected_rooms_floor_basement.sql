-- Allow basement as floor 0 for per-floor room deduplication.
-- Run in Supabase → SQL Editor before relying on floor_number = 0 in room scans.

alter table public.detected_rooms
  drop constraint if exists detected_rooms_floor_number_check;

alter table public.detected_rooms
  add constraint detected_rooms_floor_number_check
  check (floor_number >= 0 and floor_number <= 99);

comment on column public.detected_rooms.floor_number is
  'Floor/level (0=basement, 1=ground/first, 2+=upper). Used for per-floor room dedup.';
