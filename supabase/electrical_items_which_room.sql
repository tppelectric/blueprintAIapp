-- Run in Supabase → SQL Editor
-- Room assignment per electrical line (Claude which_room)

alter table public.electrical_items
  add column if not exists which_room text default 'UNASSIGNED';

comment on column public.electrical_items.which_room is 'Blueprint room/area label for room-by-room takeoff (UNASSIGNED if unknown)';
