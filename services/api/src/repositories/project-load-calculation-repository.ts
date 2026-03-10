import { randomUUID } from "node:crypto";
import type { LoadCalculatorInput, LoadCalculatorResult } from "@package/shared";
import { getDbPool } from "../db/postgres.js";

export async function saveProjectLoadCalculation(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  input: LoadCalculatorInput;
  result: LoadCalculatorResult;
}): Promise<{ loadCalculationId: string }> {
  const pool = getDbPool();
  const loadCalculationId = randomUUID();

  await pool.query(
    `
    INSERT INTO project_load_calculations (
      id,
      company_id,
      project_id,
      job_id,
      input_json,
      result_json
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
    `,
    [
      loadCalculationId,
      params.companyId,
      params.projectId,
      params.jobId ?? null,
      JSON.stringify(params.input),
      JSON.stringify(params.result)
    ]
  );

  return { loadCalculationId };
}

