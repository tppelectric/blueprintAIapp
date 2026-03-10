-- Tally entries and searchable fixture/device library (company-scoped).

CREATE TABLE IF NOT EXISTS project_tally_entries (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES tenant_companies(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  job_id TEXT,
  device_type TEXT NOT NULL,
  ai_quantity INTEGER NOT NULL DEFAULT 0,
  manual_delta INTEGER NOT NULL DEFAULT 0,
  final_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_tally_entries_company_id
  ON project_tally_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_project_tally_entries_project_id
  ON project_tally_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tally_entries_job_id
  ON project_tally_entries(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_tally_entries_scope
  ON project_tally_entries(company_id, project_id, job_id, device_type);

CREATE TABLE IF NOT EXISTS device_fixture_library (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES tenant_companies(id) ON DELETE CASCADE,
  device_type TEXT NOT NULL,
  plan_symbol TEXT,
  device_name TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  model_number TEXT NOT NULL,
  description TEXT,
  common_application TEXT,
  mounting_type TEXT,
  lumens NUMERIC(10,2),
  wattage NUMERIC(10,2),
  voltage TEXT,
  unit_cost NUMERIC(12,2),
  installed_cost NUMERIC(12,2),
  image_url TEXT,
  installation_photo TEXT,
  manufacturer_photo TEXT,
  nec_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_fixture_library_company_id
  ON device_fixture_library(company_id);
CREATE INDEX IF NOT EXISTS idx_device_fixture_library_manufacturer
  ON device_fixture_library(company_id, manufacturer);
CREATE INDEX IF NOT EXISTS idx_device_fixture_library_device_type
  ON device_fixture_library(company_id, device_type);

