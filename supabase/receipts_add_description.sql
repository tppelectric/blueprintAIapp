-- Optional free-text description on receipts (separate from notes). Run after receipts.sql.
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.receipts.description IS 'User-editable receipt summary or memo; distinct from AI notes.';
