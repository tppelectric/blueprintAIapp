-- Integration credentials and options (JobTread foundation).
-- Run in Supabase SQL editor if the table is not already present.

create table if not exists public.integration_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  company_id text,
  api_key_ciphertext text,
  auto_sync_enabled boolean not null default false,
  sync_interval text not null default 'manual'
    check (sync_interval in ('hourly', 'daily', 'manual')),
  import_customers boolean not null default true,
  import_jobs boolean not null default true,
  export_daily_logs boolean not null default false,
  export_photos boolean not null default false,
  export_time_entries boolean not null default false,
  last_sync_at timestamptz,
  customers_synced_count integer not null default 0,
  jobs_synced_count integer not null default 0,
  connection_status text not null default 'unknown',
  connection_message text,
  updated_at timestamptz not null default now()
);

create index if not exists integration_settings_provider_idx
  on public.integration_settings (provider);

alter table public.integration_settings enable row level security;

-- Authenticated users cannot read secrets directly; use service role in API routes.
create policy "integration_settings_no_client_access"
  on public.integration_settings
  for all
  using (false)
  with check (false);

comment on table public.integration_settings is
  'External integrations; API keys stored encrypted via app server (INTEGRATIONS_ENCRYPTION_KEY).';
