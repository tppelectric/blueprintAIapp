-- Persisted WiFi analyzer/builder results scoped by company/project/job.

CREATE TABLE IF NOT EXISTS project_wifi_designs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  job_id TEXT,
  input_json JSONB NOT NULL,
  result_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_wifi_designs_company_id
  ON project_wifi_designs(company_id);
CREATE INDEX IF NOT EXISTS idx_project_wifi_designs_project_id
  ON project_wifi_designs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_wifi_designs_job_id
  ON project_wifi_designs(job_id);

