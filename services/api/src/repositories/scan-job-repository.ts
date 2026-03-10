import { randomUUID } from "node:crypto";

import { getDbPool } from "../db/postgres.js";

export type ScanJobStatus =
  | "queued"
  | "processing"
  | "analyzing_symbols"
  | "grouping_devices"
  | "generating_takeoff"
  | "completed"
  | "failed";

export type ProjectScanJob = {
  id: string;
  companyId: string;
  projectId: string;
  jobId: string | null;
  source: string;
  fileName: string | null;
  scanMode: string;
  status: ScanJobStatus;
  progressPercent: number;
  currentStep: string;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: string;
  company_id: string;
  project_id: string;
  job_id: string | null;
  source: string;
  file_name: string | null;
  scan_mode: string;
  status: ScanJobStatus;
  progress_percent: number;
  current_step: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbRow): ProjectScanJob {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    jobId: row.job_id,
    source: row.source,
    fileName: row.file_name,
    scanMode: row.scan_mode,
    status: row.status,
    progressPercent: row.progress_percent,
    currentStep: row.current_step,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function createScanJob(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  source: string;
  fileName?: string;
  scanMode: "mock" | "real";
}): Promise<ProjectScanJob> {
  const pool = getDbPool();
  const id = randomUUID();
  const result = await pool.query<DbRow>(
    `
    INSERT INTO project_scan_jobs (
      id,
      company_id,
      project_id,
      job_id,
      source,
      file_name,
      scan_mode,
      status,
      progress_percent,
      current_step
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING
      id, company_id, project_id, job_id, source, file_name, scan_mode, status, progress_percent, current_step,
      error_message, started_at, completed_at, created_at, updated_at
    `,
    [
      id,
      params.companyId,
      params.projectId,
      params.jobId ?? null,
      params.source,
      params.fileName ?? null,
      params.scanMode,
      "queued",
      0,
      "Queued"
    ]
  );
  return mapRow(result.rows[0]);
}

export async function updateScanJobProgress(params: {
  companyId: string;
  projectId: string;
  scanJobId: string;
  status: ScanJobStatus;
  progressPercent: number;
  currentStep: string;
  errorMessage?: string | null;
  completed?: boolean;
}): Promise<void> {
  const pool = getDbPool();
  await pool.query(
    `
    UPDATE project_scan_jobs
    SET
      status = $4,
      progress_percent = $5,
      current_step = $6,
      error_message = $7,
      completed_at = CASE WHEN $8::boolean THEN NOW() ELSE completed_at END,
      updated_at = NOW()
    WHERE company_id = $1
      AND project_id = $2
      AND id = $3
    `,
    [
      params.companyId,
      params.projectId,
      params.scanJobId,
      params.status,
      Math.max(0, Math.min(100, Math.round(params.progressPercent))),
      params.currentStep,
      params.errorMessage ?? null,
      params.completed ?? false
    ]
  );
}

export async function getScanJobById(params: {
  companyId: string;
  projectId: string;
  scanJobId: string;
}): Promise<ProjectScanJob | null> {
  const pool = getDbPool();
  const result = await pool.query<DbRow>(
    `
    SELECT
      id, company_id, project_id, job_id, source, file_name, scan_mode, status, progress_percent, current_step,
      error_message, started_at, completed_at, created_at, updated_at
    FROM project_scan_jobs
    WHERE company_id = $1
      AND project_id = $2
      AND id = $3
    LIMIT 1
    `,
    [params.companyId, params.projectId, params.scanJobId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export async function getLatestImportedFileForScan(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
}): Promise<string | null> {
  const pool = getDbPool();
  const result = await pool.query<{ file_name: string }>(
    `
    SELECT file_name
    FROM project_blueprints
    WHERE company_id = $1
      AND project_id = $2
      AND ($3::text IS NULL OR job_id = $3)
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [params.companyId, params.projectId, params.jobId ?? null]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return result.rows[0].file_name;
}
