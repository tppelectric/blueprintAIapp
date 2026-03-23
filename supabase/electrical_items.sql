-- Run this in Supabase → SQL Editor → New query → Run
-- Creates table for Claude electrical takeoff results (saved from /api/analyze-page)

create table if not exists public.electrical_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  page_number integer not null check (page_number >= 1),
  category text not null check (
    category in ('fixture', 'panel', 'wiring', 'plan_note')
  ),
  description text not null,
  specification text not null default '',
  quantity numeric not null default 1 check (quantity >= 0),
  unit text not null default 'EA',
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  raw_note text,
  gpt_count integer,
  final_count integer,
  verification_status text not null default 'pending',
  verified_by text,
  user_edited boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists electrical_items_project_id_idx
  on public.electrical_items (project_id);

create index if not exists electrical_items_project_page_idx
  on public.electrical_items (project_id, page_number);

comment on table public.electrical_items is 'Electrical takeoff line items from Claude blueprint analysis';
