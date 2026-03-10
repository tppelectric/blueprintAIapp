-- Project-level material price snapshots using TEXT IDs and company isolation.

CREATE TABLE IF NOT EXISTS project_material_price_snapshots (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source TEXT NOT NULL,
  prices_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_material_price_snapshots_company_id
  ON project_material_price_snapshots(company_id);

CREATE INDEX IF NOT EXISTS idx_project_material_price_snapshots_project_id
  ON project_material_price_snapshots(project_id);
