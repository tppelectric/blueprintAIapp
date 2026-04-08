-- Supply house contacts for material-order email buttons (homepage widget + admin settings).

CREATE TABLE IF NOT EXISTS public.supply_house_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT NOT NULL,
  subject_override TEXT,
  body_closing_override TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supply_house_contacts_active_sort_idx
  ON public.supply_house_contacts (active, sort_order);

ALTER TABLE public.supply_house_contacts ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can read active contacts (material order mailto buttons).
DROP POLICY IF EXISTS "supply_house_contacts_select_active" ON public.supply_house_contacts;
CREATE POLICY "supply_house_contacts_select_active"
  ON public.supply_house_contacts FOR SELECT TO authenticated
  USING (active = true);

-- Admins can read all rows (including inactive) for settings.
DROP POLICY IF EXISTS "supply_house_contacts_select_admin" ON public.supply_house_contacts;
CREATE POLICY "supply_house_contacts_select_admin"
  ON public.supply_house_contacts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND p.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "supply_house_contacts_insert_admin" ON public.supply_house_contacts;
CREATE POLICY "supply_house_contacts_insert_admin"
  ON public.supply_house_contacts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND p.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "supply_house_contacts_update_admin" ON public.supply_house_contacts;
CREATE POLICY "supply_house_contacts_update_admin"
  ON public.supply_house_contacts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND p.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND p.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "supply_house_contacts_delete_admin" ON public.supply_house_contacts;
CREATE POLICY "supply_house_contacts_delete_admin"
  ON public.supply_house_contacts FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true)
        AND p.role IN ('admin', 'super_admin')
    )
  );

GRANT SELECT ON public.supply_house_contacts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.supply_house_contacts TO authenticated;
