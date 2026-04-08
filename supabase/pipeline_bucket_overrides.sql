-- Maps raw need_ready_to_invoice strings to pipeline buckets (super_admin sync UI).
-- Apply in Supabase SQL editor.

create table if not exists public.pipeline_bucket_overrides (
  id uuid primary key default gen_random_uuid(),
  need_ready_to_invoice_value text not null unique,
  bucket text not null,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_bucket_overrides_bucket_idx
  on public.pipeline_bucket_overrides (bucket);

comment on table public.pipeline_bucket_overrides is 'Overrides default BUCKET_MAP for job pipeline tile counts.';

alter table public.pipeline_bucket_overrides enable row level security;

-- Match jobs table: open policies for authenticated app (API uses service role for writes).
drop policy if exists "pipeline_bucket_overrides_select_all" on public.pipeline_bucket_overrides;
create policy "pipeline_bucket_overrides_select_all" on public.pipeline_bucket_overrides
  for select using (true);

drop policy if exists "pipeline_bucket_overrides_insert_all" on public.pipeline_bucket_overrides;
create policy "pipeline_bucket_overrides_insert_all" on public.pipeline_bucket_overrides
  for insert with check (true);

drop policy if exists "pipeline_bucket_overrides_update_all" on public.pipeline_bucket_overrides;
create policy "pipeline_bucket_overrides_update_all" on public.pipeline_bucket_overrides
  for update using (true) with check (true);

drop policy if exists "pipeline_bucket_overrides_delete_all" on public.pipeline_bucket_overrides;
create policy "pipeline_bucket_overrides_delete_all" on public.pipeline_bucket_overrides
  for delete using (true);
