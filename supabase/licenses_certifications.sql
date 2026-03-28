-- ═══════════════════════════════════════════════════════════════════════════
-- TPP Electric — Licenses & certifications (Supabase)
-- Run in SQL editor. Uses auth.users for employee holders.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_type TEXT NOT NULL CHECK (holder_type IN ('company', 'employee')),
  holder_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  license_status TEXT NOT NULL DEFAULT 'active'
    CHECK (license_status IN ('active', 'in_pursuit', 'expired', 'suspended')),
  license_name TEXT NOT NULL DEFAULT '',
  license_type TEXT NOT NULL DEFAULT 'other',
  license_type_custom TEXT,
  license_number TEXT,
  issuing_authority TEXT,
  jurisdiction_summary TEXT,
  state TEXT,
  county TEXT,
  municipality TEXT,
  issue_date DATE,
  expiry_date DATE,
  renewal_fee NUMERIC(12, 2),
  notes TEXT,
  license_pdf_path TEXT,
  requires_ce BOOLEAN NOT NULL DEFAULT false,
  ce_hours_required NUMERIC(8, 2),
  ce_hours_completed NUMERIC(8, 2) NOT NULL DEFAULT 0,
  ce_period_start DATE,
  ce_period_end DATE,
  ce_renewal_deadline DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS licenses_holder_type_idx ON public.licenses (holder_type);
CREATE INDEX IF NOT EXISTS licenses_status_idx ON public.licenses (license_status);
CREATE INDEX IF NOT EXISTS licenses_expiry_idx ON public.licenses (expiry_date);
CREATE INDEX IF NOT EXISTS licenses_holder_user_idx ON public.licenses (holder_user_id);

COMMENT ON TABLE public.licenses IS 'Company and employee licenses / certifications.';

-- Per completed CE course (drives hours_completed on license via app)
CREATE TABLE IF NOT EXISTS public.ce_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES public.licenses (id) ON DELETE CASCADE,
  course_name TEXT NOT NULL DEFAULT '',
  provider TEXT,
  course_date DATE NOT NULL,
  hours_earned NUMERIC(8, 2) NOT NULL DEFAULT 0,
  cost NUMERIC(12, 2),
  certificate_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ce_courses_license_idx ON public.ce_courses (license_id, course_date DESC);

-- Renewal / reporting cycles (optional history; UI may use license.ce_* for current period)
CREATE TABLE IF NOT EXISTS public.continuing_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES public.licenses (id) ON DELETE CASCADE,
  title TEXT,
  period_start DATE,
  period_end DATE,
  hours_required NUMERIC(8, 2),
  hours_completed NUMERIC(8, 2) NOT NULL DEFAULT 0,
  deadline_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS continuing_education_license_idx
  ON public.continuing_education (license_id, period_start DESC);

-- Checklist (in pursuit + renewal tasks)
CREATE TABLE IF NOT EXISTS public.license_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES public.licenses (id) ON DELETE CASCADE,
  requirement_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS license_requirements_license_idx
  ON public.license_requirements (license_id, sort_order);

CREATE TABLE IF NOT EXISTS public.license_study_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES public.licenses (id) ON DELETE CASCADE,
  material_type TEXT NOT NULL
    CHECK (material_type IN (
      'document', 'video', 'link', 'note', 'book', 'practice_test'
    )),
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  url TEXT,
  file_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS license_study_materials_license_idx
  ON public.license_study_materials (license_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.license_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES public.licenses (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'update',
  summary TEXT NOT NULL,
  detail JSONB,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS license_history_license_idx
  ON public.license_history (license_id, created_at DESC);

INSERT INTO storage.buckets (id, name, public)
VALUES ('license-files', 'license-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "license_files_authenticated" ON storage.objects;
CREATE POLICY "license_files_authenticated"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'license-files')
  WITH CHECK (bucket_id = 'license-files');

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ce_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.continuing_education ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_study_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "licenses_all_authenticated" ON public.licenses;
CREATE POLICY "licenses_all_authenticated"
  ON public.licenses FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ce_courses_all_authenticated" ON public.ce_courses;
CREATE POLICY "ce_courses_all_authenticated"
  ON public.ce_courses FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "continuing_education_all_authenticated" ON public.continuing_education;
CREATE POLICY "continuing_education_all_authenticated"
  ON public.continuing_education FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "license_requirements_all_authenticated" ON public.license_requirements;
CREATE POLICY "license_requirements_all_authenticated"
  ON public.license_requirements FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "license_study_materials_all_authenticated" ON public.license_study_materials;
CREATE POLICY "license_study_materials_all_authenticated"
  ON public.license_study_materials FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "license_history_all_authenticated" ON public.license_history;
CREATE POLICY "license_history_all_authenticated"
  ON public.license_history FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ce_courses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.continuing_education TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_requirements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_study_materials TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.license_history TO authenticated;
