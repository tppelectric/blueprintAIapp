-- Persisted load calculations scoped by company/project/job.

CREATE TABLE IF NOT EXISTS project_load_calculations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  job_id TEXT,
  input_json JSONB NOT NULL,
  result_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_load_calculations_company_id
  ON project_load_calculations(company_id);
CREATE INDEX IF NOT EXISTS idx_project_load_calculations_project_id
  ON project_load_calculations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_load_calculations_job_id
  ON project_load_calculations(job_id);

