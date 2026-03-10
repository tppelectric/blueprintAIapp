-- Project-level estimate persistence using TEXT IDs and company isolation.

CREATE TABLE IF NOT EXISTS project_estimates (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  points_json JSONB NOT NULL,
  pricing_json JSONB NOT NULL,
  estimate_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_estimates_company_id
  ON project_estimates(company_id);

CREATE INDEX IF NOT EXISTS idx_project_estimates_project_id
  ON project_estimates(project_id);
