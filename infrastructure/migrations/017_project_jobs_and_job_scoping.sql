-- Project and Job workflow support.
-- Adds project metadata fields required by project creation flow and job-level scoping columns.

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  customer_name TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  project_address TEXT,
  city TEXT,
  state TEXT,
  client_name TEXT,
  project_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_company_id
  ON projects(company_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_projects_tenant_companies'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT fk_projects_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'projects'
  ) THEN
    ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS project_address TEXT,
      ADD COLUMN IF NOT EXISTS city TEXT,
      ADD COLUMN IF NOT EXISTS state TEXT,
      ADD COLUMN IF NOT EXISTS client_name TEXT,
      ADD COLUMN IF NOT EXISTS project_type TEXT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  job_name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_jobs_job_type_check
    CHECK (job_type IN ('electrical_estimate', 'low_voltage_estimate', 'lighting_upgrade', 'service_upgrade', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_project_jobs_company_id
  ON project_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_project_jobs_project_id
  ON project_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_jobs_company_project
  ON project_jobs(company_id, project_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_project_jobs_tenant_companies'
  ) THEN
    ALTER TABLE project_jobs
      ADD CONSTRAINT fk_project_jobs_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE project_blueprints ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE project_rooms ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE project_symbol_detections ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE project_notes ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE project_estimates ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE project_panel_schedules ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE project_service_designs ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE project_material_lists ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE project_material_price_snapshots ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE blueprint_processing_runs ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE blueprint_processing_sheet_results ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE project_export_jobs ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE project_legend_symbols ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE project_symbol_corrections ADD COLUMN IF NOT EXISTS job_id TEXT;

CREATE INDEX IF NOT EXISTS idx_project_blueprints_job_id
  ON project_blueprints(job_id);
CREATE INDEX IF NOT EXISTS idx_project_rooms_job_id
  ON project_rooms(job_id);
CREATE INDEX IF NOT EXISTS idx_project_symbol_detections_job_id
  ON project_symbol_detections(job_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_job_id
  ON project_notes(job_id);
CREATE INDEX IF NOT EXISTS idx_project_estimates_job_id
  ON project_estimates(job_id);
CREATE INDEX IF NOT EXISTS idx_project_panel_schedules_job_id
  ON project_panel_schedules(job_id);
CREATE INDEX IF NOT EXISTS idx_project_service_designs_job_id
  ON project_service_designs(job_id);
CREATE INDEX IF NOT EXISTS idx_project_material_lists_job_id
  ON project_material_lists(job_id);
CREATE INDEX IF NOT EXISTS idx_project_material_price_snapshots_job_id
  ON project_material_price_snapshots(job_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_processing_runs_job_id
  ON blueprint_processing_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_blueprint_processing_sheet_results_job_id
  ON blueprint_processing_sheet_results(job_id);
CREATE INDEX IF NOT EXISTS idx_project_export_jobs_job_id
  ON project_export_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_project_legend_symbols_job_id
  ON project_legend_symbols(job_id);
CREATE INDEX IF NOT EXISTS idx_project_symbol_corrections_job_id
  ON project_symbol_corrections(job_id);
