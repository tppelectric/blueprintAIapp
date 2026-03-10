import { randomUUID } from "node:crypto";

import type { MaterialEstimate, ProjectMaterialListRecord } from "@package/shared";
import { getDbPool } from "../db/postgres.js";

type DbRow = {
  id: string;
  source: "takeoff" | "fallback";
  items_json: MaterialEstimate[];
  created_at: string;
};

export async function saveProjectMaterialList(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  source: "takeoff" | "fallback";
  items: MaterialEstimate[];
}): Promise<{ listId: string; createdAt: string }> {
  const pool = getDbPool();
  const listId = randomUUID();

  const result = await pool.query<{ created_at: string }>(
    `
    INSERT INTO project_material_lists (
      id,
      company_id,
      project_id,
      job_id,
      source,
      items_json
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
    RETURNING created_at
    `,
    [listId, params.companyId, params.projectId, params.jobId ?? null, params.source, JSON.stringify(params.items)]
  );

  return { listId, createdAt: result.rows[0]?.created_at ?? new Date().toISOString() };
}

export async function getLatestProjectMaterialList(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
}): Promise<ProjectMaterialListRecord | null> {
  const pool = getDbPool();
  const result = await pool.query<DbRow>(
    `
    SELECT id, source, items_json, created_at
    FROM project_material_lists
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
    listId: row.id,
    createdAt: row.created_at,
    source: row.source,
    items: row.items_json ?? []
  };
}
