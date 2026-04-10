-- Add floor_number to detected_rooms for multi-floor deduplication
alter table public.detected_rooms
  add column if not exists floor_number integer not null default 1
  check (floor_number >= 1 and floor_number <= 99);

comment on column public.detected_rooms.floor_number is
  'Floor/level this room is on (1-based). Used to distinguish same-named rooms on different floors.';
