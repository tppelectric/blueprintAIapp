import { randomUUID } from "node:crypto";

import type { DedicatedCircuit, PanelScheduleRow, ProjectPanelSchedule } from "@package/shared";
import { getDbPool } from "../db/postgres.js";

type PanelScheduleRowDb = {
  id: string;
  source_json: DedicatedCircuit[];
  schedule_json: PanelScheduleRow[];
  created_at: string;
};

export async function saveProjectPanelSchedule(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  sourceCircuits: DedicatedCircuit[];
  rows: PanelScheduleRow[];
}): Promise<{ scheduleId: string; createdAt: string }> {
  const pool = getDbPool();
  const scheduleId = randomUUID();

  const result = await pool.query<{ created_at: string }>(
    `
    INSERT INTO project_panel_schedules (
      id,
      company_id,
      project_id,
      job_id,
      source_json,
      schedule_json
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
    RETURNING created_at
    `,
    [
      scheduleId,
      params.companyId,
      params.projectId,
      params.jobId ?? null,
      JSON.stringify(params.sourceCircuits),
      JSON.stringify(params.rows)
    ]
  );

  return { scheduleId, createdAt: result.rows[0]?.created_at ?? new Date().toISOString() };
}

export async function getLatestProjectPanelSchedule(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
}): Promise<ProjectPanelSchedule | null> {
  const pool = getDbPool();
  const result = await pool.query<PanelScheduleRowDb>(
    `
    SELECT id, source_json, schedule_json, created_at
    FROM project_panel_schedules
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
    scheduleId: row.id,
    createdAt: row.created_at,
    sourceCircuits: row.source_json ?? [],
    rows: row.schedule_json ?? []
  };
}
