-- Text-ID company-scoped tables for export queue and reusable symbol confirmations.

CREATE TABLE IF NOT EXISTS project_export_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  export_type TEXT NOT NULL CHECK (export_type IN ('csv', 'jobtread_sync')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'completed', 'failed')),
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_export_jobs_company_id
  ON project_export_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_project_export_jobs_project_id
  ON project_export_jobs(project_id);

CREATE TABLE IF NOT EXISTS project_symbol_library (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  symbol_key TEXT NOT NULL,
  confirmed_symbol_type TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, symbol_key)
);

CREATE INDEX IF NOT EXISTS idx_project_symbol_library_company_id
  ON project_symbol_library(company_id);
