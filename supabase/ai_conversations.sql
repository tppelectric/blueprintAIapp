-- Floating AI Assistant: persist chat per user + page context.
-- Run in Supabase SQL editor if the table is not already present.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  page_context text not null,
  messages jsonb not null default '[]'::jsonb,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, page_context)
);

create index if not exists ai_conversations_user_page_idx
  on public.ai_conversations (user_id, page_context);

comment on table public.ai_conversations is
  'Per-page AI assistant threads; read/written via /api/ai-conversations.';

alter table public.ai_conversations enable row level security;

drop policy if exists "ai_conversations_select_own" on public.ai_conversations;
create policy "ai_conversations_select_own"
  on public.ai_conversations for select
  using (auth.uid() = user_id);

drop policy if exists "ai_conversations_insert_own" on public.ai_conversations;
create policy "ai_conversations_insert_own"
  on public.ai_conversations for insert
  with check (auth.uid() = user_id);

drop policy if exists "ai_conversations_update_own" on public.ai_conversations;
create policy "ai_conversations_update_own"
  on public.ai_conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ai_conversations_delete_own" on public.ai_conversations;
create policy "ai_conversations_delete_own"
  on public.ai_conversations for delete
  using (auth.uid() = user_id);
