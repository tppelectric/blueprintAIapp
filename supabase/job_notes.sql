-- AI assistant chat snapshots linked to jobs. Run in Supabase SQL editor after jobs exist.

create table if not exists public.job_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  content jsonb not null default '[]'::jsonb,
  type text not null default 'ai_chat',
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists job_notes_job_id_created_at_idx
  on public.job_notes (job_id, created_at desc);

comment on table public.job_notes is 'Structured notes on jobs (e.g. exported AI chat).';

alter table public.job_notes enable row level security;

drop policy if exists "job_notes_select_all" on public.job_notes;
create policy "job_notes_select_all"
  on public.job_notes for select using (true);
drop policy if exists "job_notes_insert_all" on public.job_notes;
create policy "job_notes_insert_all"
  on public.job_notes for insert with check (true);
drop policy if exists "job_notes_update_all" on public.job_notes;
create policy "job_notes_update_all"
  on public.job_notes for update using (true) with check (true);
drop policy if exists "job_notes_delete_all" on public.job_notes;
create policy "job_notes_delete_all"
  on public.job_notes for delete using (true);
