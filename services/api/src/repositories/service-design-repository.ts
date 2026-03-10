import { randomUUID } from "node:crypto";

import type { ProjectServiceDesignRecord, UtilityProvider, UtilityServiceDesign } from "@package/shared";
import { getDbPool } from "../db/postgres.js";

type ServiceSize = "150A" | "200A" | "320A" | "400A" | "CT metering";
type InstallationType = "overhead" | "underground";

type DbRow = {
  id: string;
  provider: UtilityProvider;
  service_amps: number;
  continuous_load_amps: number | null;
  installation_type: InstallationType;
  service_size: ServiceSize;
  design_json: UtilityServiceDesign;
  created_at: string;
};

export async function saveProjectServiceDesign(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  provider: UtilityProvider;
  serviceAmps: number;
  continuousLoadAmps?: number;
  installationType: InstallationType;
  serviceSize: ServiceSize;
  design: UtilityServiceDesign;
}): Promise<{ designId: string; createdAt: string }> {
  const pool = getDbPool();
  const designId = randomUUID();

  const result = await pool.query<{ created_at: string }>(
    `
    INSERT INTO project_service_designs (
      id,
      company_id,
      project_id,
      job_id,
      provider,
      service_amps,
      continuous_load_amps,
      installation_type,
      service_size,
      design_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    RETURNING created_at
    `,
    [
      designId,
      params.companyId,
      params.projectId,
      params.jobId ?? null,
      params.provider,
      params.serviceAmps,
      params.continuousLoadAmps ?? null,
      params.installationType,
      params.serviceSize,
      JSON.stringify(params.design)
    ]
  );

  return { designId, createdAt: result.rows[0]?.created_at ?? new Date().toISOString() };
}

export async function getLatestProjectServiceDesign(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
}): Promise<ProjectServiceDesignRecord | null> {
  const pool = getDbPool();
  const result = await pool.query<DbRow>(
    `
    SELECT
      id,
      provider,
      service_amps,
      continuous_load_amps,
      installation_type,
      service_size,
      design_json,
      created_at
    FROM project_service_designs
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

  const row = result.rows[0];
  return {
    designId: row.id,
    createdAt: row.created_at,
    provider: row.provider,
    serviceAmps: Number(row.service_amps),
    continuousLoadAmps: row.continuous_load_amps ?? undefined,
    installationType: row.installation_type,
    serviceSize: row.service_size,
    design: row.design_json
  };
}
