-- Project-level utility service design persistence using TEXT IDs and company isolation.

CREATE TABLE IF NOT EXISTS project_service_designs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  service_amps NUMERIC(10,2) NOT NULL,
  continuous_load_amps NUMERIC(10,2),
  installation_type TEXT NOT NULL,
  service_size TEXT NOT NULL,
  design_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_service_designs_company_id
  ON project_service_designs(company_id);

CREATE INDEX IF NOT EXISTS idx_project_service_designs_project_id
  ON project_service_designs(project_id);
