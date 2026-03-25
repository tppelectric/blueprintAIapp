-- Scan library: typed saved scans, plan source tracing, job_attachments audit fields.
-- Run in Supabase SQL Editor (idempotent).

-- ── saved_scans: scan_type + optional floor-plan JSON on full snapshots ─────
alter table public.saved_scans
  add column if not exists scan_type text not null default 'electrical';

alter table public.saved_scans
  add column if not exists plan_rooms_json jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'saved_scans_scan_type_check'
      and conrelid = 'public.saved_scans'::regclass
  ) then
    alter table public.saved_scans
      add constraint saved_scans_scan_type_check
      check (scan_type in ('electrical', 'room', 'full', 'target'));
  end if;
end $$;

comment on column public.saved_scans.scan_type is
  'electrical | room | full | target — how this snapshot should be recalled.';
comment on column public.saved_scans.plan_rooms_json is
  'Optional Floor-plan AI room list (json) stored with full snapshots.';

-- ── Tool calculation tables: which blueprint project supplied imported data ─
alter table public.wifi_calculations
  add column if not exists source_project_id uuid references public.projects (id) on delete set null;

alter table public.electrical_projects
  add column if not exists source_project_id uuid references public.projects (id) on delete set null;

alter table public.load_calculations
  add column if not exists source_project_id uuid references public.projects (id) on delete set null;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'av_calculations'
  ) then
    alter table public.av_calculations
      add column if not exists source_project_id uuid references public.projects (id) on delete set null;
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'smarthome_calculations'
  ) then
    alter table public.smarthome_calculations
      add column if not exists source_project_id uuid references public.projects (id) on delete set null;
  end if;
end $$;

create index if not exists wifi_calculations_source_project_idx
  on public.wifi_calculations (source_project_id);
create index if not exists electrical_projects_source_project_idx
  on public.electrical_projects (source_project_id);
create index if not exists load_calculations_source_project_idx
  on public.load_calculations (source_project_id);

-- ── job_attachments: plan import audit (job optional when logging tool-only import) ─
alter table public.job_attachments
  alter column job_id drop not null;

alter table public.job_attachments
  add column if not exists blueprint_project_id uuid references public.projects (id) on delete set null;

alter table public.job_attachments
  add column if not exists tool_slug text;

alter table public.job_attachments
  add column if not exists import_summary jsonb;

alter table public.job_attachments
  add column if not exists imported_at timestamptz not null default now();

create index if not exists job_attachments_blueprint_project_idx
  on public.job_attachments (blueprint_project_id);

comment on column public.job_attachments.blueprint_project_id is
  'Blueprint / plans project scan data was imported from.';
comment on column public.job_attachments.tool_slug is
  'Analyzer tool that consumed the import (e.g. wifi, av, load_calc).';
comment on column public.job_attachments.import_summary is
  'JSON summary of what was imported (room scan id, item counts, etc.).';
