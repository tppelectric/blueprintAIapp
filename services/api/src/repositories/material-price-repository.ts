import { randomUUID } from "node:crypto";

import type { MaterialPricePoint, ProjectMaterialPriceSnapshot } from "@package/shared";
import { getDbPool } from "../db/postgres.js";

type DbRow = {
  id: string;
  source: "manual" | "scheduled_30_day";
  prices_json: MaterialPricePoint[];
  created_at: string;
};

type DueProjectRow = {
  company_id: string;
  project_id: string;
};

export async function saveMaterialPriceSnapshot(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  source: "manual" | "scheduled_30_day";
  prices: MaterialPricePoint[];
}): Promise<{ snapshotId: string; createdAt: string }> {
  const pool = getDbPool();
  const snapshotId = randomUUID();

  const result = await pool.query<{ created_at: string }>(
    `
    INSERT INTO project_material_price_snapshots (
      id,
      company_id,
      project_id,
      job_id,
      source,
      prices_json
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
    RETURNING created_at
    `,
    [snapshotId, params.companyId, params.projectId, params.jobId ?? null, params.source, JSON.stringify(params.prices)]
  );

  return { snapshotId, createdAt: result.rows[0]?.created_at ?? new Date().toISOString() };
}

export async function listMaterialPriceSnapshots(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  limit?: number;
}): Promise<ProjectMaterialPriceSnapshot[]> {
  const pool = getDbPool();
  const result = await pool.query<DbRow>(
    `
    SELECT id, source, prices_json, created_at
    FROM project_material_price_snapshots
    WHERE company_id = $1
      AND project_id = $2
      AND ($3::text IS NULL OR job_id = $3)
    ORDER BY created_at DESC
    LIMIT $4
    `,
    [params.companyId, params.projectId, params.jobId ?? null, params.limit ?? 12]
  );

  return result.rows.map((row) => ({
    snapshotId: row.id,
    createdAt: row.created_at,
    source: row.source,
    prices: row.prices_json ?? []
  }));
}

export async function listProjectsDueForMaterialPriceSnapshots(limit = 25): Promise<
  Array<{ companyId: string; projectId: string }>
> {
  const pool = getDbPool();
  const result = await pool.query<DueProjectRow>(
    `
    SELECT pb.company_id, pb.project_id
    FROM (
      SELECT DISTINCT company_id, project_id
      FROM project_blueprints
    ) pb
    LEFT JOIN LATERAL (
      SELECT MAX(created_at) AS last_snapshot_at
      FROM project_material_price_snapshots s
      WHERE s.company_id = pb.company_id
        AND s.project_id = pb.project_id
    ) snap ON TRUE
    WHERE snap.last_snapshot_at IS NULL
       OR snap.last_snapshot_at <= NOW() - INTERVAL '30 days'
    ORDER BY pb.company_id, pb.project_id
    LIMIT $1
    `,
    [limit]
  );

  return result.rows.map((row) => ({
    companyId: row.company_id,
    projectId: row.project_id
  }));
}
