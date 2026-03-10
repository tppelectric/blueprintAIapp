-- Company-level contractor configuration and supplier integrations.
-- Active schema uses TEXT tenant IDs (tenant_companies.id).

CREATE TABLE IF NOT EXISTS company_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL UNIQUE,
  default_labor_rate NUMERIC(12,2) NOT NULL DEFAULT 85.00,
  apprentice_labor_rate NUMERIC(12,2) NOT NULL DEFAULT 45.00,
  labor_burden_percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
  material_markup_percentage NUMERIC(6,2) NOT NULL DEFAULT 20,
  overhead_percentage NUMERIC(6,2) NOT NULL DEFAULT 10,
  profit_margin_percentage NUMERIC(6,2) NOT NULL DEFAULT 15,
  preferred_wire_brand TEXT,
  preferred_device_brand TEXT,
  preferred_breaker_brand TEXT,
  default_utility_provider TEXT NOT NULL DEFAULT 'Central Hudson',
  default_voltage_system TEXT NOT NULL DEFAULT '120/240',
  electrical_code_version TEXT NOT NULL DEFAULT 'NEC 2023',
  -- Additional configurable defaults required by estimating workflow.
  default_price_per_point NUMERIC(12,2) NOT NULL DEFAULT 179.22,
  default_cost_per_square_foot NUMERIC(12,2) NOT NULL DEFAULT 6.94,
  default_labor_hours_per_point NUMERIC(8,3) NOT NULL DEFAULT 0.55,
  default_crew_size INTEGER NOT NULL DEFAULT 2,
  load_calculation_method TEXT NOT NULL DEFAULT 'NEC Standard Method',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_settings_utility_provider_check
    CHECK (default_utility_provider IN ('Central Hudson', 'NYSEG')),
  CONSTRAINT company_settings_voltage_system_check
    CHECK (default_voltage_system IN ('120/240', '120/208', '277/480')),
  CONSTRAINT company_settings_code_version_check
    CHECK (electrical_code_version = 'NEC 2023'),
  CONSTRAINT company_settings_load_method_check
    CHECK (load_calculation_method IN ('NEC Standard Method', 'NEC Optional Method')),
  CONSTRAINT company_settings_default_crew_size_check
    CHECK (default_crew_size >= 1)
);

CREATE INDEX IF NOT EXISTS idx_company_settings_company_id
  ON company_settings(company_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_company_settings_tenant_companies'
  ) THEN
    ALTER TABLE company_settings
      ADD CONSTRAINT fk_company_settings_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Backfill defaults for any existing tenant companies.
INSERT INTO company_settings (
  id,
  company_id
)
SELECT
  'cfg-' || tc.id,
  tc.id
FROM tenant_companies tc
LEFT JOIN company_settings cs ON cs.company_id = tc.id
WHERE cs.company_id IS NULL;

CREATE TABLE IF NOT EXISTS supplier_accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  username TEXT,
  encrypted_password TEXT,
  api_token TEXT,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT supplier_accounts_supplier_name_check
    CHECK (supplier_name IN ('Home Depot Pro', 'Copper Electric Supply', 'HZ Electric Supply'))
);

-- Legacy compatibility: ensure required columns exist if table came from old migration branch.
ALTER TABLE supplier_accounts
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_password TEXT,
  ADD COLUMN IF NOT EXISTS api_token TEXT,
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_supplier_accounts_company_id
  ON supplier_accounts(company_id);

CREATE INDEX IF NOT EXISTS idx_supplier_accounts_company_supplier
  ON supplier_accounts(company_id, supplier_name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_accounts_company_supplier
  ON supplier_accounts(company_id, supplier_name);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_supplier_accounts_tenant_companies'
  ) THEN
    ALTER TABLE supplier_accounts
      ADD CONSTRAINT fk_supplier_accounts_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Keep company_settings initialized for every new tenant.
CREATE OR REPLACE FUNCTION initialize_company_settings_for_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO company_settings (id, company_id)
  VALUES ('cfg-' || NEW.id, NEW.id)
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_initialize_company_settings_for_tenant ON tenant_companies;

CREATE TRIGGER trg_initialize_company_settings_for_tenant
AFTER INSERT ON tenant_companies
FOR EACH ROW
EXECUTE FUNCTION initialize_company_settings_for_tenant();
