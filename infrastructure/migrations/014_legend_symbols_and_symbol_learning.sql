-- Legend symbol persistence and symbol-learning fields.

CREATE TABLE IF NOT EXISTS project_legend_symbols (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES tenant_companies(id),
  project_id TEXT NOT NULL,
  blueprint_id TEXT REFERENCES project_blueprints(id) ON DELETE CASCADE,
  symbol_image TEXT NOT NULL,
  symbol_description TEXT NOT NULL,
  symbol_class TEXT,
  source_page_number INTEGER,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_legend_symbols_company_id
  ON project_legend_symbols(company_id);
CREATE INDEX IF NOT EXISTS idx_project_legend_symbols_project_id
  ON project_legend_symbols(project_id);

CREATE TABLE IF NOT EXISTS project_symbol_corrections (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES tenant_companies(id),
  project_id TEXT NOT NULL,
  detection_id TEXT NOT NULL REFERENCES project_symbol_detections(id) ON DELETE CASCADE,
  previous_symbol_type TEXT NOT NULL,
  corrected_symbol_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_symbol_corrections_company_id
  ON project_symbol_corrections(company_id);
CREATE INDEX IF NOT EXISTS idx_project_symbol_corrections_project_id
  ON project_symbol_corrections(project_id);

ALTER TABLE project_symbol_detections
  ADD COLUMN IF NOT EXISTS bbox_json JSONB,
  ADD COLUMN IF NOT EXISTS page_number INTEGER,
  ADD COLUMN IF NOT EXISTS detection_source TEXT,
  ADD COLUMN IF NOT EXISTS ai_candidate_type TEXT,
  ADD COLUMN IF NOT EXISTS legend_similarity_score NUMERIC(6,4);
