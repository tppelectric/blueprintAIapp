-- Company-scoped project workflow tables using TEXT IDs.
-- These tables support current application IDs (for example p-001) while preserving company isolation.

CREATE TABLE IF NOT EXISTS project_blueprints (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source TEXT NOT NULL,
  file_name TEXT NOT NULL,
  sheet_number TEXT,
  title TEXT,
  page_number INTEGER,
  plan_scale TEXT,
  scan_mode TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_blueprints_company_id
  ON project_blueprints(company_id);
CREATE INDEX IF NOT EXISTS idx_project_blueprints_project_id
  ON project_blueprints(project_id);

CREATE TABLE IF NOT EXISTS project_rooms (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  blueprint_id TEXT REFERENCES project_blueprints(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  area_sq_ft NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_rooms_company_id
  ON project_rooms(company_id);
CREATE INDEX IF NOT EXISTS idx_project_rooms_project_id
  ON project_rooms(project_id);

CREATE TABLE IF NOT EXISTS project_symbol_detections (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  blueprint_id TEXT REFERENCES project_blueprints(id) ON DELETE CASCADE,
  room_id TEXT REFERENCES project_rooms(id) ON DELETE SET NULL,
  symbol_type TEXT NOT NULL,
  confidence NUMERIC(6,4) NOT NULL,
  legend_match_label TEXT,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_symbol_detections_company_id
  ON project_symbol_detections(company_id);
CREATE INDEX IF NOT EXISTS idx_project_symbol_detections_project_id
  ON project_symbol_detections(project_id);

CREATE TABLE IF NOT EXISTS project_notes (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  blueprint_id TEXT REFERENCES project_blueprints(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('general', 'electrical')),
  note_text TEXT NOT NULL,
  impacts_scope BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_notes_company_id
  ON project_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_project_id
  ON project_notes(project_id);
