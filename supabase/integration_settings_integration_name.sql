-- Adds integration_name for JobTread and other providers (NOT NULL safe upserts).
-- Run in Supabase SQL editor if PATCH /api/integrations/jobtread fails on integration_name.

alter table public.integration_settings
  add column if not exists integration_name text;

update public.integration_settings
set integration_name = coalesce(nullif(trim(integration_name), ''), provider)
where integration_name is null;
