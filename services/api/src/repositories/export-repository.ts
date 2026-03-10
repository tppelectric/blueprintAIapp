import { randomUUID } from "node:crypto";

import type { ExportJob } from "@package/shared";
import { getDbPool } from "../db/postgres.js";

type DbExportRow = {
  id: string;
  project_id: string;
  job_id: string | null;
  export_type: "csv" | "jobtread_sync";
  status: "queued" | "completed" | "failed";
  created_at: string;
  details: string | null;
};

function mapExportJob(row: DbExportRow): ExportJob {
  return {
    id: row.id,
    projectId: row.project_id,
    jobId: row.job_id,
    type: row.export_type,
    status: row.status,
    createdAt: row.created_at,
    details: row.details ?? ""
  };
}

export async function listProjectExportJobs(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
}): Promise<ExportJob[]> {
  const pool = getDbPool();
  const result = await pool.query<DbExportRow>(
    `
    SELECT id, project_id, job_id, export_type, status, created_at, details
    FROM project_export_jobs
    WHERE company_id = $1
      AND project_id = $2
      AND ($3::text IS NULL OR job_id = $3)
    ORDER BY created_at DESC
    `,
    [params.companyId, params.projectId, params.jobId ?? null]
  );

  return result.rows.map((row) => mapExportJob(row));
}

export async function queueProjectExportJob(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  type: "csv" | "jobtread_sync";
  details?: string;
}): Promise<ExportJob> {
  const pool = getDbPool();
  const jobId = randomUUID();

  const result = await pool.query<DbExportRow>(
    `
    INSERT INTO project_export_jobs (
      id,
      company_id,
      project_id,
      job_id,
      export_type,
      status,
      details
    ) VALUES ($1,$2,$3,$4,$5,'queued',$6)
    RETURNING id, project_id, job_id, export_type, status, created_at, details
    `,
    [jobId, params.companyId, params.projectId, params.jobId ?? null, params.type, params.details ?? null]
  );

  return mapExportJob(result.rows[0]);
}
