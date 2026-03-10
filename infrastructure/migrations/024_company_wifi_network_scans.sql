-- Persisted WiFi network scan history per company (optional project/job scope).

CREATE TABLE IF NOT EXISTS company_wifi_network_scans (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES tenant_companies(id) ON DELETE CASCADE,
  project_id TEXT,
  job_id TEXT,
  scan_name TEXT,
  input_json JSONB NOT NULL,
  result_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_wifi_network_scans_company_id
  ON company_wifi_network_scans(company_id);
CREATE INDEX IF NOT EXISTS idx_company_wifi_network_scans_project_id
  ON company_wifi_network_scans(project_id);
CREATE INDEX IF NOT EXISTS idx_company_wifi_network_scans_job_id
  ON company_wifi_network_scans(job_id);
CREATE INDEX IF NOT EXISTS idx_company_wifi_network_scans_created_at
  ON company_wifi_network_scans(created_at DESC);

