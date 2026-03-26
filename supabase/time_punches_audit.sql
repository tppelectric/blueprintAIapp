-- Audit / approval columns on time_punches. Run after time_punches exists.

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS approval_status TEXT;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS discrepancy_flag BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS discrepancy_note TEXT;

COMMENT ON COLUMN public.time_punches.approval_status IS
  'NULL while punch open; pending | approved | rejected after punch out.';
COMMENT ON COLUMN public.time_punches.discrepancy_flag IS
  'Manager flagged this punch for review.';

UPDATE public.time_punches
SET approval_status = 'pending'
WHERE punch_out_at IS NOT NULL
  AND approval_status IS NULL;
