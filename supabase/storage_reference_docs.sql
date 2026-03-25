-- Private bucket for reference PDFs. Authenticated users can read objects;
-- only admin / super_admin can upload or delete.
-- Run in Supabase SQL Editor after storage is enabled.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reference-docs',
  'reference-docs',
  false,
  52428800,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Clean up old policies if re-running
DROP POLICY IF EXISTS "reference_docs_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "reference_docs_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "reference_docs_update_admin" ON storage.objects;
DROP POLICY IF EXISTS "reference_docs_delete_admin" ON storage.objects;

CREATE POLICY "reference_docs_select_authenticated"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reference-docs'
    AND public.app_user_is_active()
  );

CREATE POLICY "reference_docs_insert_admin"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'reference-docs'
    AND public.app_user_is_active()
    AND public.app_user_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "reference_docs_update_admin"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'reference-docs'
    AND public.app_user_is_active()
    AND public.app_user_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    bucket_id = 'reference-docs'
    AND public.app_user_is_active()
    AND public.app_user_role() IN ('admin', 'super_admin')
  );

CREATE POLICY "reference_docs_delete_admin"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'reference-docs'
    AND public.app_user_is_active()
    AND public.app_user_role() IN ('admin', 'super_admin')
  );
