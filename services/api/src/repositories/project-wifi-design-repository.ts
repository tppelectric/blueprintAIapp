import { randomUUID } from "node:crypto";
import { getDbPool } from "../db/postgres.js";

export async function saveProjectWifiDesign(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}): Promise<{ wifiDesignId: string }> {
  const pool = getDbPool();
  const wifiDesignId = randomUUID();

  await pool.query(
    `
    INSERT INTO project_wifi_designs (
      id,
      company_id,
      project_id,
      job_id,
      input_json,
      result_json
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
    `,
    [
      wifiDesignId,
      params.companyId,
      params.projectId,
      params.jobId ?? null,
      JSON.stringify(params.input),
      JSON.stringify(params.result)
    ]
  );

  return { wifiDesignId };
}

