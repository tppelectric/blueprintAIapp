-- ═══════════════════════════════════════════════════════════════════════════
-- TPP Electric — Fleet / vehicle management (extends inventory_qr_tracking.sql)
-- Run in Supabase SQL editor after assets + asset_locations exist.
-- ═══════════════════════════════════════════════════════════════════════════

-- Allow fleet / yard locations for parked vehicles
ALTER TABLE public.asset_locations DROP CONSTRAINT IF EXISTS asset_locations_location_type_check;
ALTER TABLE public.asset_locations ADD CONSTRAINT asset_locations_location_type_check
  CHECK (location_type IN (
    'warehouse', 'truck', 'job_site', 'boiler_room', 'office', 'fleet'
  ));

COMMENT ON CONSTRAINT asset_locations_location_type_check ON public.asset_locations IS
  'fleet = vehicle parking / company yard (optional).';

-- Vehicle row on assets
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_asset_type_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_asset_type_check
  CHECK (asset_type IN ('tool', 'material', 'equipment', 'vehicle'));

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS vehicle_year INTEGER;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS vehicle_make TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS vehicle_model TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS vehicle_color TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS license_plate TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS vin TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS ezpass_id TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS insurance_provider TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS insurance_policy_number TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS registration_expires DATE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS inspection_expires DATE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS insurance_expires DATE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS current_mileage INTEGER;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS last_oil_change_date DATE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS last_oil_change_mileage INTEGER;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS oil_change_interval_miles INTEGER NOT NULL DEFAULT 5000;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS next_oil_change_due_date DATE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS next_service_date DATE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS next_service_notes TEXT;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS last_service_date DATE;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS mileage_updated_at DATE;

COMMENT ON COLUMN public.assets.current_mileage IS 'Odometer; updated via mileage log.';
COMMENT ON COLUMN public.assets.oil_change_interval_miles IS 'Miles between oil changes (default 5000).';

-- Service history (one row per shop visit / renewal / repair)
CREATE TABLE IF NOT EXISTS public.vehicle_service_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets (id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  service_date DATE NOT NULL,
  mileage INTEGER,
  cost NUMERIC(12, 2),
  vendor TEXT,
  notes TEXT,
  next_service_date DATE,
  next_service_mileage INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS vehicle_service_history_asset_idx
  ON public.vehicle_service_history (asset_id, service_date DESC);

COMMENT ON TABLE public.vehicle_service_history IS 'Fleet maintenance log; drives UI service history tab.';

-- Uploaded files (paths in storage bucket inventory-assets, prefix vehicles/{asset_id}/)
CREATE TABLE IF NOT EXISTS public.vehicle_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets (id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL
    CHECK (doc_type IN ('registration', 'insurance', 'inspection', 'title', 'other')),
  file_name TEXT NOT NULL DEFAULT '',
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS vehicle_documents_asset_idx
  ON public.vehicle_documents (asset_id, created_at DESC);

COMMENT ON TABLE public.vehicle_documents IS 'Vehicle paperwork; files in storage bucket inventory-assets.';

-- Optional seed locations (uncomment if you want starter fleet rows)
-- INSERT INTO public.asset_locations (name, location_type, description)
-- VALUES
--   ('Fleet — Main yard', 'fleet', 'Company vehicle parking'),
--   ('Fleet — Shop', 'fleet', 'Vehicle staging')
-- ON CONFLICT DO NOTHING;

ALTER TABLE public.vehicle_service_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_service_history_all" ON public.vehicle_service_history;
CREATE POLICY "vehicle_service_history_all"
  ON public.vehicle_service_history FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "vehicle_documents_all" ON public.vehicle_documents;
CREATE POLICY "vehicle_documents_all"
  ON public.vehicle_documents FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_service_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_documents TO authenticated;
