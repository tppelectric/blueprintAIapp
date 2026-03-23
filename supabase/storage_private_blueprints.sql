-- Run in Supabase SQL Editor after migrating existing data if needed.
-- 1) Make the blueprints bucket private (objects served only via signed URLs or service role).
UPDATE storage.buckets
SET public = false
WHERE name = 'blueprints';

-- 2) Optional: tighten policies so anonymous users cannot read/write objects.
--    Adjust to match your auth model. Example — deny anon, allow authenticated read/write:
-- DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
-- (Recreate policies in Dashboard → Storage → Policies for bucket `blueprints`.)

-- After this change, uploads must use the service role (e.g. POST /api/upload-pdf)
-- and PDFs must be loaded with signed URLs from POST /api/get-blueprint-url.
