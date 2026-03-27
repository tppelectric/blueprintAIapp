-- Extends api_usage for route-level Claude tracking (run after supabase/api_usage.sql).
-- Allows nullable project/page for non-blueprint tools; adds token counts and api_route.

alter table public.api_usage alter column project_id drop not null;
alter table public.api_usage alter column page_number drop not null;

alter table public.api_usage drop constraint if exists api_usage_scan_type_check;
alter table public.api_usage add constraint api_usage_scan_type_check
  check (scan_type in ('quick', 'standard', 'deep', 'manual', 'ai_route'));

alter table public.api_usage add column if not exists api_route text;
alter table public.api_usage add column if not exists model text;
alter table public.api_usage add column if not exists input_tokens integer;
alter table public.api_usage add column if not exists output_tokens integer;
alter table public.api_usage add column if not exists user_id uuid;

comment on column public.api_usage.api_route is 'Logical route id e.g. scan-receipt, analyze-page (null = legacy blueprint row).';
comment on column public.api_usage.scan_type is 'Blueprint scan mode, or ai_route for tool calls without a blueprint page context.';

create index if not exists api_usage_api_route_idx on public.api_usage (api_route);
create index if not exists api_usage_user_id_idx on public.api_usage (user_id);
