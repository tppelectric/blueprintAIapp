-- Enforce tenant integrity for TEXT-based workflow tables.
-- This introduces a text-key tenant registry and foreign keys from active project workflow tables.

CREATE TABLE IF NOT EXISTS tenant_companies (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tenant_companies (id, display_name)
VALUES ('company-primary', 'Primary Company')
ON CONFLICT (id) DO NOTHING;

WITH discovered_companies AS (
  SELECT company_id FROM project_blueprints
  UNION
  SELECT company_id FROM project_rooms
  UNION
  SELECT company_id FROM project_symbol_detections
  UNION
  SELECT company_id FROM project_notes
  UNION
  SELECT company_id FROM project_estimates
  UNION
  SELECT company_id FROM project_panel_schedules
  UNION
  SELECT company_id FROM project_service_designs
  UNION
  SELECT company_id FROM project_material_lists
  UNION
  SELECT company_id FROM project_material_price_snapshots
  UNION
  SELECT company_id FROM blueprint_processing_runs
  UNION
  SELECT company_id FROM blueprint_processing_sheet_results
  UNION
  SELECT company_id FROM project_export_jobs
  UNION
  SELECT company_id FROM project_symbol_library
)
INSERT INTO tenant_companies (id, display_name)
SELECT company_id, company_id
FROM discovered_companies
WHERE company_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_blueprints_tenant_companies'
  ) THEN
    ALTER TABLE project_blueprints
      ADD CONSTRAINT fk_project_blueprints_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_rooms_tenant_companies'
  ) THEN
    ALTER TABLE project_rooms
      ADD CONSTRAINT fk_project_rooms_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_symbol_detections_tenant_companies'
  ) THEN
    ALTER TABLE project_symbol_detections
      ADD CONSTRAINT fk_project_symbol_detections_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_notes_tenant_companies'
  ) THEN
    ALTER TABLE project_notes
      ADD CONSTRAINT fk_project_notes_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_estimates_tenant_companies'
  ) THEN
    ALTER TABLE project_estimates
      ADD CONSTRAINT fk_project_estimates_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_panel_schedules_tenant_companies'
  ) THEN
    ALTER TABLE project_panel_schedules
      ADD CONSTRAINT fk_project_panel_schedules_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_service_designs_tenant_companies'
  ) THEN
    ALTER TABLE project_service_designs
      ADD CONSTRAINT fk_project_service_designs_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_material_lists_tenant_companies'
  ) THEN
    ALTER TABLE project_material_lists
      ADD CONSTRAINT fk_project_material_lists_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_material_price_snapshots_tenant_companies'
  ) THEN
    ALTER TABLE project_material_price_snapshots
      ADD CONSTRAINT fk_project_material_price_snapshots_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_blueprint_processing_runs_tenant_companies'
  ) THEN
    ALTER TABLE blueprint_processing_runs
      ADD CONSTRAINT fk_blueprint_processing_runs_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_blueprint_processing_sheet_results_tenant_companies'
  ) THEN
    ALTER TABLE blueprint_processing_sheet_results
      ADD CONSTRAINT fk_blueprint_processing_sheet_results_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_export_jobs_tenant_companies'
  ) THEN
    ALTER TABLE project_export_jobs
      ADD CONSTRAINT fk_project_export_jobs_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_project_symbol_library_tenant_companies'
  ) THEN
    ALTER TABLE project_symbol_library
      ADD CONSTRAINT fk_project_symbol_library_tenant_companies
      FOREIGN KEY (company_id) REFERENCES tenant_companies(id);
  END IF;
END $$;
