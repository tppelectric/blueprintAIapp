import { randomUUID } from "node:crypto";
import type { CreateProjectJobInput, ProjectJob } from "@package/shared";
import { getDbPool } from "../db/postgres.js";

type JobRow = {
  id: string;
  company_id: string;
  project_id: string;
  job_name: string;
  job_type: ProjectJob["type"];
  description: string;
  created_at: string;
  updated_at: string;
};

function mapJobRow(row: JobRow): ProjectJob {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    name: row.job_name,
    type: row.job_type,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listProjectJobs(params: { companyId: string; projectId: string }): Promise<ProjectJob[]> {
  const pool = getDbPool();
  const result = await pool.query<JobRow>(
    `
    SELECT id, company_id, project_id, job_name, job_type, description, created_at, updated_at
    FROM project_jobs
    WHERE company_id = $1
      AND project_id = $2
    ORDER BY created_at DESC
    `,
    [params.companyId, params.projectId]
  );

  return result.rows.map((row) => mapJobRow(row));
}

export async function createProjectJob(params: {
  companyId: string;
  projectId: string;
  input: CreateProjectJobInput;
}): Promise<ProjectJob> {
  const pool = getDbPool();
  const jobId = `job-${randomUUID()}`;

  const result = await pool.query<JobRow>(
    `
    INSERT INTO project_jobs (
      id,
      company_id,
      project_id,
      job_name,
      job_type,
      description
    ) VALUES ($1,$2,$3,$4,$5,$6)
    RETURNING id, company_id, project_id, job_name, job_type, description, created_at, updated_at
    `,
    [jobId, params.companyId, params.projectId, params.input.jobName, params.input.jobType, params.input.description]
  );

  return mapJobRow(result.rows[0]);
}

export async function updateProjectJob(params: {
  companyId: string;
  projectId: string;
  jobId: string;
  input: CreateProjectJobInput;
}): Promise<ProjectJob | null> {
  const pool = getDbPool();
  const result = await pool.query<JobRow>(
    `
    UPDATE project_jobs
    SET
      job_name = $4,
      job_type = $5,
      description = $6,
      updated_at = NOW()
    WHERE company_id = $1
      AND project_id = $2
      AND id = $3
    RETURNING id, company_id, project_id, job_name, job_type, description, created_at, updated_at
    `,
    [params.companyId, params.projectId, params.jobId, params.input.jobName, params.input.jobType, params.input.description]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapJobRow(result.rows[0]);
}

export async function deleteProjectJob(params: {
  companyId: string;
  projectId: string;
  jobId: string;
}): Promise<boolean> {
  const pool = getDbPool();
  const client = await pool.connect();

  async function deleteScoped(tableName: string): Promise<void> {
    try {
      await client.query(
        `DELETE FROM ${tableName} WHERE company_id = $1 AND project_id = $2 AND job_id = $3`,
        [params.companyId, params.projectId, params.jobId]
      );
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code !== "42P01" && pgError.code !== "42703") {
        throw error;
      }
    }
  }

  try {
    await client.query("BEGIN");

    await deleteScoped("project_symbol_corrections");
    await deleteScoped("project_legend_symbols");
    await deleteScoped("blueprint_processing_sheet_results");
    await deleteScoped("blueprint_processing_runs");
    await deleteScoped("project_material_price_snapshots");
    await deleteScoped("project_material_lists");
    await deleteScoped("project_service_designs");
    await deleteScoped("project_panel_schedules");
    await deleteScoped("project_estimates");
    await deleteScoped("project_export_jobs");
    await deleteScoped("project_symbol_detections");
    await deleteScoped("project_notes");
    await deleteScoped("project_rooms");
    await deleteScoped("project_blueprints");

    const deleted = await client.query(
      `
      DELETE FROM project_jobs
      WHERE company_id = $1
        AND project_id = $2
        AND id = $3
      `,
      [params.companyId, params.projectId, params.jobId]
    );

    await client.query("COMMIT");
    const deletedCount = Number((deleted as { rowCount?: number }).rowCount ?? 0);
    return deletedCount > 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function renameJobIdForProject(params: {
  companyId: string;
  projectId: string;
  currentJobId: string;
  newJobId: string;
}): Promise<boolean> {
  if (params.currentJobId === params.newJobId) {
    return true;
  }

  const pool = getDbPool();
  const client = await pool.connect();

  async function updateJobScope(tableName: string): Promise<void> {
    try {
      await client.query(
        `UPDATE ${tableName} SET job_id = $4 WHERE company_id = $1 AND project_id = $2 AND job_id = $3`,
        [params.companyId, params.projectId, params.currentJobId, params.newJobId]
      );
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code !== "42P01" && pgError.code !== "42703") {
        throw error;
      }
    }
  }

  try {
    await client.query("BEGIN");

    const exists = await client.query(
      `
      SELECT id
      FROM project_jobs
      WHERE company_id = $1
        AND project_id = $2
        AND id = $3
      LIMIT 1
      `,
      [params.companyId, params.projectId, params.currentJobId]
    );
    if (exists.rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }

    const collision = await client.query(
      `
      SELECT id
      FROM project_jobs
      WHERE company_id = $1
        AND project_id = $2
        AND id = $3
      LIMIT 1
      `,
      [params.companyId, params.projectId, params.newJobId]
    );
    if (collision.rows.length > 0) {
      throw new Error("A job with the new job ID already exists in this project.");
    }

    await updateJobScope("project_blueprints");
    await updateJobScope("project_rooms");
    await updateJobScope("project_symbol_detections");
    await updateJobScope("project_notes");
    await updateJobScope("project_estimates");
    await updateJobScope("project_panel_schedules");
    await updateJobScope("project_service_designs");
    await updateJobScope("project_material_lists");
    await updateJobScope("project_material_price_snapshots");
    await updateJobScope("blueprint_processing_runs");
    await updateJobScope("blueprint_processing_sheet_results");
    await updateJobScope("project_export_jobs");
    await updateJobScope("project_legend_symbols");
    await updateJobScope("project_symbol_corrections");
    await updateJobScope("project_load_calculations");
    await updateJobScope("project_wifi_designs");

    await client.query(
      `
      UPDATE project_jobs
      SET id = $4, updated_at = NOW()
      WHERE company_id = $1
        AND project_id = $2
        AND id = $3
      `,
      [params.companyId, params.projectId, params.currentJobId, params.newJobId]
    );

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
