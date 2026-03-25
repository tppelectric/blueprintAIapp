-- Run on existing databases that already have `nec_questions` without `job_id`.
-- (New installs: use supabase/nec_questions.sql which includes job_id.)

ALTER TABLE public.nec_questions
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.jobs (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS nec_questions_job_id_idx
  ON public.nec_questions (job_id)
  WHERE job_id IS NOT NULL;

-- Client-side "Save to job" from NEC checker requires INSERT (if not already present):
DROP POLICY IF EXISTS "nec_questions_insert_all" ON public.nec_questions;
CREATE POLICY "nec_questions_insert_all"
  ON public.nec_questions FOR INSERT WITH CHECK (true);
