-- Background scan job tracking for blueprint scan progress UX.

CREATE TABLE IF NOT EXISTS project_scan_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES tenant_companies(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  job_id TEXT,
  source TEXT NOT NULL DEFAULT 'local',
  file_name TEXT,
  scan_mode TEXT NOT NULL DEFAULT 'real',
  status TEXT NOT NULL,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  current_step TEXT NOT NULL DEFAULT 'Queued',
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_scan_jobs_status_check
    CHECK (
      status IN (
        'queued',
        'processing',
        'analyzing_symbols',
        'grouping_devices',
        'generating_takeoff',
        'completed',
        'failed'
      )
    ),
  CONSTRAINT project_scan_jobs_progress_range_check
    CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

CREATE INDEX IF NOT EXISTS idx_project_scan_jobs_company_id
  ON project_scan_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_project_scan_jobs_project_id
  ON project_scan_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_scan_jobs_job_id
  ON project_scan_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_project_scan_jobs_company_project_job
  ON project_scan_jobs(company_id, project_id, job_id, created_at DESC);

