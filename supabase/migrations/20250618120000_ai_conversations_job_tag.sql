-- Tag floating AI assistant threads to a synced JobTread job.
-- Mirror of supabase/ai_conversations_job_tag.sql for migration tracking.

alter table public.ai_conversations
  add column if not exists jobtread_job_id text,
  add column if not exists job_label text;

comment on column public.ai_conversations.jobtread_job_id is
  'JobTread job id (jobs.jobtread_id) or local jobs.id fallback for manual jobs';

comment on column public.ai_conversations.job_label is
  'Display chip, e.g. "2460 · O''Brien Residence"';

create index if not exists ai_conversations_jobtread_job_id_idx
  on public.ai_conversations (jobtread_job_id)
  where jobtread_job_id is not null;
