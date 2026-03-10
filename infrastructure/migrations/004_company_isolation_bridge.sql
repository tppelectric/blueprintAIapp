-- Bridge migration to enforce multi-company SaaS structure with company_id isolation.
-- This migration is additive and safe against existing baseline tables.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS company_id UUID,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_company_id_fkey;
ALTER TABLE projects
  ADD CONSTRAINT projects_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_created_by_user_id_fkey;
ALTER TABLE projects
  ADD CONSTRAINT projects_created_by_user_id_fkey
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);

ALTER TABLE sheets ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE legends ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE symbols ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE panel_schedules ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE fixture_schedules ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE takeoffs ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE material_estimates ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE load_calculations ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE service_designs ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE material_lists ADD COLUMN IF NOT EXISTS company_id UUID;

ALTER TABLE sheets DROP CONSTRAINT IF EXISTS sheets_company_id_fkey;
ALTER TABLE sheets ADD CONSTRAINT sheets_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_company_id_fkey;
ALTER TABLE rooms ADD CONSTRAINT rooms_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE legends DROP CONSTRAINT IF EXISTS legends_company_id_fkey;
ALTER TABLE legends ADD CONSTRAINT legends_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE symbols DROP CONSTRAINT IF EXISTS symbols_company_id_fkey;
ALTER TABLE symbols ADD CONSTRAINT symbols_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_company_id_fkey;
ALTER TABLE notes ADD CONSTRAINT notes_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE panel_schedules DROP CONSTRAINT IF EXISTS panel_schedules_company_id_fkey;
ALTER TABLE panel_schedules ADD CONSTRAINT panel_schedules_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE fixture_schedules DROP CONSTRAINT IF EXISTS fixture_schedules_company_id_fkey;
ALTER TABLE fixture_schedules ADD CONSTRAINT fixture_schedules_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE takeoffs DROP CONSTRAINT IF EXISTS takeoffs_company_id_fkey;
ALTER TABLE takeoffs ADD CONSTRAINT takeoffs_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE material_estimates DROP CONSTRAINT IF EXISTS material_estimates_company_id_fkey;
ALTER TABLE material_estimates ADD CONSTRAINT material_estimates_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE export_jobs DROP CONSTRAINT IF EXISTS export_jobs_company_id_fkey;
ALTER TABLE export_jobs ADD CONSTRAINT export_jobs_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_company_id_fkey;
ALTER TABLE estimates ADD CONSTRAINT estimates_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE load_calculations DROP CONSTRAINT IF EXISTS load_calculations_company_id_fkey;
ALTER TABLE load_calculations ADD CONSTRAINT load_calculations_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE service_designs DROP CONSTRAINT IF EXISTS service_designs_company_id_fkey;
ALTER TABLE service_designs ADD CONSTRAINT service_designs_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE material_lists DROP CONSTRAINT IF EXISTS material_lists_company_id_fkey;
ALTER TABLE material_lists ADD CONSTRAINT material_lists_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sheets_company_id ON sheets(company_id);
CREATE INDEX IF NOT EXISTS idx_rooms_company_id ON rooms(company_id);
CREATE INDEX IF NOT EXISTS idx_legends_company_id ON legends(company_id);
CREATE INDEX IF NOT EXISTS idx_symbols_company_id ON symbols(company_id);
CREATE INDEX IF NOT EXISTS idx_notes_company_id ON notes(company_id);
CREATE INDEX IF NOT EXISTS idx_panel_schedules_company_id ON panel_schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_fixture_schedules_company_id ON fixture_schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_takeoffs_company_id ON takeoffs(company_id);
CREATE INDEX IF NOT EXISTS idx_material_estimates_company_id ON material_estimates(company_id);
CREATE INDEX IF NOT EXISTS idx_export_jobs_company_id ON export_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_estimates_company_id ON estimates(company_id);
CREATE INDEX IF NOT EXISTS idx_load_calculations_company_id ON load_calculations(company_id);
CREATE INDEX IF NOT EXISTS idx_service_designs_company_id ON service_designs(company_id);
CREATE INDEX IF NOT EXISTS idx_material_lists_company_id ON material_lists(company_id);

-- NOTE: Application layer must set company_id on all writes.
-- Existing rows should be backfilled in a data migration before NOT NULL enforcement.
