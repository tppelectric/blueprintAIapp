-- API usage / cost tracking for blueprint scans (run in Supabase SQL editor or migrate).
-- RLS: disabled; writes go through Next.js API routes using the service role (same pattern as saved_scans).

create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  page_number integer not null,
  scan_type text not null check (scan_type in ('quick', 'standard', 'deep', 'manual')),
  claude_cost numeric(12, 6) not null default 0,
  openai_cost numeric(12, 6) not null default 0,
  total_cost numeric(12, 6) not null default 0,
  pages_analyzed integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists api_usage_project_id_idx on public.api_usage (project_id);
create index if not exists api_usage_created_at_idx on public.api_usage (created_at desc);

comment on table public.api_usage is 'Per-page scan cost estimates for Claude/OpenAI usage tracking.';
