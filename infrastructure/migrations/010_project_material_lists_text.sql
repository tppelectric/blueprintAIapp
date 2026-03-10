-- Project-level material list persistence using TEXT IDs and company isolation.

CREATE TABLE IF NOT EXISTS project_material_lists (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source TEXT NOT NULL,
  items_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_material_lists_company_id
  ON project_material_lists(company_id);

CREATE INDEX IF NOT EXISTS idx_project_material_lists_project_id
  ON project_material_lists(project_id);
