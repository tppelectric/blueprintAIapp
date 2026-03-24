-- Authenticated browser uploads to `blueprints` (direct client → Storage, no Vercel body limit).
-- Run in Supabase SQL Editor after reviewing your existing storage policies.

DROP POLICY IF EXISTS "blueprints_authenticated_insert_uploads" ON storage.objects;

-- Allow signed-in users to upload objects under uploads/
CREATE POLICY "blueprints_authenticated_insert_uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'blueprints'
  AND name LIKE 'uploads/%'
);

-- Optional: allow users to read objects they need for their app (or rely on signed URLs only).
-- If you use only server-signed URLs, you can omit SELECT for end users.
-- CREATE POLICY "blueprints_authenticated_select_own"
-- ON storage.objects FOR SELECT TO authenticated
-- USING (bucket_id = 'blueprints');
