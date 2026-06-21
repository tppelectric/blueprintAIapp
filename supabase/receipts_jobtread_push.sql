-- Track manual receipt → JobTread comment pushes (text note; image attach is a later phase).
-- Run in Supabase SQL Editor.

alter table public.receipts
  add column if not exists pushed_to_jobtread_at timestamptz,
  add column if not exists jobtread_comment_id text;

comment on column public.receipts.pushed_to_jobtread_at is
  'When receipt text note was manually pushed to JobTread via createComment.';

comment on column public.receipts.jobtread_comment_id is
  'JobTread comment id returned from createComment on push.';
