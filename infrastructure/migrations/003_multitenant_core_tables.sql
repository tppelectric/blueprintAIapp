CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  project_type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);

CREATE TABLE IF NOT EXISTS blueprints (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  sheet_number TEXT,
  sheet_title TEXT,
  page_number INTEGER,
  scale TEXT,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blueprints_company_id ON blueprints(company_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_project_id ON blueprints(project_id);

CREATE TABLE IF NOT EXISTS symbols (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  blueprint_id UUID REFERENCES blueprints(id) ON DELETE SET NULL,
  symbol_type TEXT NOT NULL,
  confidence NUMERIC(6,4) NOT NULL,
  room_name TEXT,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_symbols_company_id ON symbols(company_id);
CREATE INDEX IF NOT EXISTS idx_symbols_project_id ON symbols(project_id);

CREATE TABLE IF NOT EXISTS takeoffs (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  takeoff_json JSONB NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_takeoffs_company_id ON takeoffs(company_id);
CREATE INDEX IF NOT EXISTS idx_takeoffs_project_id ON takeoffs(project_id);

CREATE TABLE IF NOT EXISTS estimates (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  estimate_json JSONB NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimates_company_id ON estimates(company_id);
CREATE INDEX IF NOT EXISTS idx_estimates_project_id ON estimates(project_id);

CREATE TABLE IF NOT EXISTS load_calculations (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nec_version TEXT NOT NULL DEFAULT '2023 NEC',
  calculation_json JSONB NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_load_calculations_company_id ON load_calculations(company_id);
CREATE INDEX IF NOT EXISTS idx_load_calculations_project_id ON load_calculations(project_id);

CREATE TABLE IF NOT EXISTS panel_schedules (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nec_version TEXT NOT NULL DEFAULT '2023 NEC',
  schedule_json JSONB NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_panel_schedules_company_id ON panel_schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_panel_schedules_project_id ON panel_schedules(project_id);

CREATE TABLE IF NOT EXISTS service_designs (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nec_version TEXT NOT NULL DEFAULT '2023 NEC',
  design_json JSONB NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_designs_company_id ON service_designs(company_id);
CREATE INDEX IF NOT EXISTS idx_service_designs_project_id ON service_designs(project_id);

CREATE TABLE IF NOT EXISTS materials (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  item_code TEXT,
  description TEXT NOT NULL,
  brand TEXT,
  unit TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_company_id ON materials(company_id);

CREATE TABLE IF NOT EXISTS material_prices (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  supplier_account_id UUID,
  previous_price NUMERIC(12,4),
  current_price NUMERIC(12,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_prices_company_id ON material_prices(company_id);
CREATE INDEX IF NOT EXISTS idx_material_prices_material_id ON material_prices(material_id);

CREATE TABLE IF NOT EXISTS supplier_accounts (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  account_reference TEXT,
  integration_type TEXT NOT NULL,
  status TEXT NOT NULL,
  config_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_accounts_company_id ON supplier_accounts(company_id);

ALTER TABLE material_prices
  DROP CONSTRAINT IF EXISTS material_prices_supplier_account_id_fkey;

ALTER TABLE material_prices
  ADD CONSTRAINT material_prices_supplier_account_id_fkey
  FOREIGN KEY (supplier_account_id) REFERENCES supplier_accounts(id) ON DELETE SET NULL;
