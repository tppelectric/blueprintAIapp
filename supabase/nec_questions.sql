-- NEC AI Q&A log (also appended to load_calculations_nec_checklists.sql).
-- Inserts from /api/nec-question use the Supabase service role (bypasses RLS).

CREATE TABLE IF NOT EXISTS public.nec_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT,
  jurisdiction TEXT DEFAULT 'NY',
  nec_edition TEXT DEFAULT '2023',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nec_questions_created_at_idx
  ON public.nec_questions (created_at DESC);

COMMENT ON TABLE public.nec_questions IS 'Claude NEC Q&A from standalone NEC checker tool.';

ALTER TABLE public.nec_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nec_questions_select_all" ON public.nec_questions;
CREATE POLICY "nec_questions_select_all"
  ON public.nec_questions FOR SELECT USING (true);
