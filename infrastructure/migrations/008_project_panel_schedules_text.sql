-- Project-level panel schedule persistence using TEXT IDs and company isolation.

CREATE TABLE IF NOT EXISTS project_panel_schedules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source_json JSONB NOT NULL,
  schedule_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_panel_schedules_company_id
  ON project_panel_schedules(company_id);

CREATE INDEX IF NOT EXISTS idx_project_panel_schedules_project_id
  ON project_panel_schedules(project_id);
