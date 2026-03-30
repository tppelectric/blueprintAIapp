-- JobTread sync audit log (service role / API only).
-- Run in Supabase SQL editor if this table is not already present.

create table if not exists public.jobtread_sync_log (
  id uuid primary key default gen_random_uuid(),
  sync_type text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  triggered_by uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_synced integer not null default 0,
  error_message text
);

create index if not exists jobtread_sync_log_started_at_idx
  on public.jobtread_sync_log (started_at desc);

comment on table public.jobtread_sync_log is
  'Manual JobTread import runs; updated by /api/integrations/jobtread/sync.';

alter table public.jobtread_sync_log enable row level security;

drop policy if exists "jobtread_sync_log_no_client_access" on public.jobtread_sync_log;
create policy "jobtread_sync_log_no_client_access"
  on public.jobtread_sync_log
  for all
  using (false)
  with check (false);
