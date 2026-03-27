-- ═══════════════════════════════════════════════════════════════════════════
-- TPP Electric — Inventory & QR tracking (Supabase)
-- Run after `jobs` exists (for optional job_id FK). Adjust RLS for production.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Locations ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.asset_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  location_type TEXT NOT NULL DEFAULT 'warehouse'
    CHECK (location_type IN ('warehouse', 'truck', 'job_site', 'boiler_room', 'office')),
  description TEXT,
  address TEXT,
  qr_code_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS asset_locations_name_idx ON public.asset_locations (name);
CREATE INDEX IF NOT EXISTS asset_locations_type_idx ON public.asset_locations (location_type);

-- ── Assets (tools, equipment, material-line items) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  asset_type TEXT NOT NULL DEFAULT 'tool'
    CHECK (asset_type IN ('tool', 'material', 'equipment')),
  asset_number TEXT NOT NULL,
  description TEXT,
  location_id UUID REFERENCES public.asset_locations (id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  assigned_to_name TEXT,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'checked_out', 'in_repair', 'retired')),
  purchase_date DATE,
  purchase_price NUMERIC(14, 2),
  serial_number TEXT,
  photo_url TEXT,
  photo_path TEXT,
  qr_code_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS assets_asset_number_key ON public.assets (asset_number);
CREATE INDEX IF NOT EXISTS assets_location_id_idx ON public.assets (location_id);
CREATE INDEX IF NOT EXISTS assets_status_idx ON public.assets (status);
CREATE INDEX IF NOT EXISTS assets_assigned_to_idx ON public.assets (assigned_to);

-- ── Materials (bulk stock) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.materials_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'ea',
  current_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  minimum_quantity NUMERIC(14, 4) NOT NULL DEFAULT 0,
  location_id UUID REFERENCES public.asset_locations (id) ON DELETE SET NULL,
  unit_cost NUMERIC(14, 4),
  supplier TEXT,
  part_number TEXT,
  qr_code_url TEXT,
  low_stock_alert BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS materials_inventory_location_idx ON public.materials_inventory (location_id);
CREATE INDEX IF NOT EXISTS materials_inventory_name_idx ON public.materials_inventory (name);

-- ── Transactions (audit trail) ───────────────────────────────────────────────
-- material_id: optional row for stock moves when asset_id is NULL (not in legacy CSV import).
CREATE TABLE IF NOT EXISTS public.asset_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.assets (id) ON DELETE SET NULL,
  material_id UUID REFERENCES public.materials_inventory (id) ON DELETE SET NULL,
  employee_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  employee_name TEXT,
  transaction_type TEXT NOT NULL
    CHECK (transaction_type IN (
      'checkout', 'checkin', 'move', 'use', 'deliver', 'report_issue'
    )),
  from_location_id UUID REFERENCES public.asset_locations (id) ON DELETE SET NULL,
  to_location_id UUID REFERENCES public.asset_locations (id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.jobs (id) ON DELETE SET NULL,
  quantity NUMERIC(14, 4),
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT asset_transactions_target_chk CHECK (
    asset_id IS NOT NULL OR material_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS asset_transactions_asset_idx ON public.asset_transactions (asset_id);
CREATE INDEX IF NOT EXISTS asset_transactions_material_idx ON public.asset_transactions (material_id);
CREATE INDEX IF NOT EXISTS asset_transactions_employee_idx ON public.asset_transactions (employee_id);
CREATE INDEX IF NOT EXISTS asset_transactions_created_idx ON public.asset_transactions (created_at DESC);

COMMENT ON TABLE public.asset_transactions IS 'TPP inventory audit: checkout/checkin/move/use/deliver/report_issue.';

-- ── Storage bucket (optional photos) ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('inventory-assets', 'inventory-assets', false)
ON CONFLICT (id) DO NOTHING;

-- ── RLS (example — tighten per org) ────────────────────────────────────────
ALTER TABLE public.asset_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_locations_all" ON public.asset_locations;
CREATE POLICY "inventory_locations_all"
  ON public.asset_locations FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inventory_assets_all" ON public.assets;
CREATE POLICY "inventory_assets_all"
  ON public.assets FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inventory_materials_all" ON public.materials_inventory;
CREATE POLICY "inventory_materials_all"
  ON public.materials_inventory FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inventory_tx_all" ON public.asset_transactions;
CREATE POLICY "inventory_tx_all"
  ON public.asset_transactions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials_inventory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_transactions TO authenticated;
