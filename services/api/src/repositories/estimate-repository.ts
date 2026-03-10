import { randomUUID } from "node:crypto";

import type {
  EstimateResult,
  PointBreakdown,
  ProjectEstimateMetricPoint,
  ProjectEstimateMetricsSummary
} from "@package/shared";
import { getDbPool } from "../db/postgres.js";

export type EstimatePricingInput = {
  laborCostPerPoint: number;
  materialCostPerPoint: number;
  markupMultiplier: number;
  baseLaborHoursPerPoint: number;
  squareFeet: number;
  finishLevel: "builder_grade" | "mid_range_residential" | "high_end_residential";
};

type PgEstimateRow = {
  id: string;
  job_id: string | null;
  points_json: PointBreakdown;
  pricing_json: EstimatePricingInput;
  estimate_json: EstimateResult;
  created_at: string;
};

type PgMetricsRow = {
  id: string;
  job_id: string | null;
  created_at: string;
  estimate_json: EstimateResult;
};

export async function saveProjectEstimate(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  points: PointBreakdown;
  pricing: EstimatePricingInput;
  estimate: EstimateResult;
}): Promise<{ estimateId: string; createdAt: string }> {
  const pool = getDbPool();
  const estimateId = randomUUID();

  const result = await pool.query<{ created_at: string }>(
    `
    INSERT INTO project_estimates (
      id,
      company_id,
      project_id,
      job_id,
      points_json,
      pricing_json,
      estimate_json
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)
    RETURNING created_at
    `,
    [
      estimateId,
      params.companyId,
      params.projectId,
      params.jobId ?? null,
      JSON.stringify(params.points),
      JSON.stringify(params.pricing),
      JSON.stringify(params.estimate)
    ]
  );

  return { estimateId, createdAt: result.rows[0]?.created_at ?? new Date().toISOString() };
}

export async function getLatestProjectEstimate(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
}): Promise<{
  estimateId: string;
  points: PointBreakdown;
  pricing: EstimatePricingInput;
  estimate: EstimateResult;
  createdAt: string;
} | null> {
  const pool = getDbPool();
  const result = await pool.query<PgEstimateRow>(
    `
    SELECT id, job_id, points_json, pricing_json, estimate_json, created_at
    FROM project_estimates
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
    estimateId: row.id,
    points: row.points_json,
    pricing: row.pricing_json,
    estimate: row.estimate_json,
    createdAt: row.created_at
  };
}

export async function listProjectEstimateMetrics(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  limit?: number;
}): Promise<{
  history: ProjectEstimateMetricPoint[];
  summary: ProjectEstimateMetricsSummary;
}> {
  const pool = getDbPool();
  const result = await pool.query<PgMetricsRow>(
    `
    SELECT id, job_id, created_at, estimate_json
    FROM project_estimates
    WHERE company_id = $1
      AND project_id = $2
      AND ($3::text IS NULL OR job_id = $3)
    ORDER BY created_at DESC
    LIMIT $4
    `,
    [params.companyId, params.projectId, params.jobId ?? null, params.limit ?? 24]
  );

  const history: ProjectEstimateMetricPoint[] = result.rows.map((row) => ({
    estimateId: row.id,
    createdAt: row.created_at,
    totalPoints: Number(row.estimate_json.totalPoints ?? 0),
    totalProjectCost: Number(row.estimate_json.totalProjectCost ?? 0),
    pricePerPoint: Number(row.estimate_json.pricePerPoint ?? 0),
    pricePerSqFt: Number(row.estimate_json.pricePerSqFt ?? 0),
    laborHours: Number(row.estimate_json.laborHours ?? 0)
  }));

  const summary: ProjectEstimateMetricsSummary =
    history.length === 0
      ? {
          count: 0,
          avgPricePerPoint: 0,
          avgPricePerSqFt: 0,
          latestTotalCost: 0,
          latestTotalPoints: 0
        }
      : {
          count: history.length,
          avgPricePerPoint: Number(
            (history.reduce((sum, row) => sum + row.pricePerPoint, 0) / history.length).toFixed(2)
          ),
          avgPricePerSqFt: Number(
            (history.reduce((sum, row) => sum + row.pricePerSqFt, 0) / history.length).toFixed(2)
          ),
          latestTotalCost: history[0].totalProjectCost,
          latestTotalPoints: history[0].totalPoints
        };

  return { history, summary };
}
