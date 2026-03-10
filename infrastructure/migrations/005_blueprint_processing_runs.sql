-- Blueprint processing persistence (company-isolated)
-- Uses TEXT IDs to match current application IDs (for example: company-primary, p-001).

CREATE TABLE IF NOT EXISTS blueprint_processing_runs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  scan_mode TEXT NOT NULL,
  processed_sheets INTEGER NOT NULL,
  detected_rooms_json JSONB NOT NULL,
  device_counts_json JSONB NOT NULL,
  extraction_payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blueprint_processing_runs_company_id
  ON blueprint_processing_runs(company_id);

CREATE INDEX IF NOT EXISTS idx_blueprint_processing_runs_project_id
  ON blueprint_processing_runs(project_id);

CREATE TABLE IF NOT EXISTS blueprint_processing_sheet_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES blueprint_processing_runs(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  sheet_number TEXT,
  sheet_title TEXT,
  page_number INTEGER,
  symbols_detected INTEGER NOT NULL,
  rooms_detected INTEGER NOT NULL,
  notes_detected INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blueprint_processing_sheet_results_run_id
  ON blueprint_processing_sheet_results(run_id);

CREATE INDEX IF NOT EXISTS idx_blueprint_processing_sheet_results_company_id
  ON blueprint_processing_sheet_results(company_id);

CREATE INDEX IF NOT EXISTS idx_blueprint_processing_sheet_results_project_id
  ON blueprint_processing_sheet_results(project_id);
