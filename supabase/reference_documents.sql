-- TPP Reference Library — documents metadata + RLS.
-- Run in Supabase SQL Editor after user_profiles / app_user_role helpers exist.
-- Also run storage_reference_docs.sql for the private bucket and object policies.

CREATE TABLE IF NOT EXISTS public.reference_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL
    CHECK (category IN ('Code', 'Utility', 'Vendor', 'Company')),
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size >= 0),
  uploaded_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reference_documents_created_at_idx
  ON public.reference_documents (created_at DESC);
CREATE INDEX IF NOT EXISTS reference_documents_category_idx
  ON public.reference_documents (category);

COMMENT ON TABLE public.reference_documents IS
  'Company reference PDFs; files live in storage bucket reference-docs.';

ALTER TABLE public.reference_documents ENABLE ROW LEVEL SECURITY;

-- Active authenticated users can read metadata (app also uses service role).
DROP POLICY IF EXISTS "reference_documents_select_auth" ON public.reference_documents;
CREATE POLICY "reference_documents_select_auth"
  ON public.reference_documents
  FOR SELECT
  TO authenticated
  USING (public.app_user_is_active());

-- Only admin / super_admin can insert (browser uploads typically go through API + service role).
DROP POLICY IF EXISTS "reference_documents_insert_admin" ON public.reference_documents;
CREATE POLICY "reference_documents_insert_admin"
  ON public.reference_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS "reference_documents_delete_admin" ON public.reference_documents;
CREATE POLICY "reference_documents_delete_admin"
  ON public.reference_documents
  FOR DELETE
  TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN ('admin', 'super_admin')
  );

-- Optional: allow admins to update title/category only if you add UI later.
DROP POLICY IF EXISTS "reference_documents_update_admin" ON public.reference_documents;
CREATE POLICY "reference_documents_update_admin"
  ON public.reference_documents
  FOR UPDATE
  TO authenticated
  USING (
    public.app_user_is_active()
    AND public.app_user_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    public.app_user_is_active()
    AND public.app_user_role() IN ('admin', 'super_admin')
  );
