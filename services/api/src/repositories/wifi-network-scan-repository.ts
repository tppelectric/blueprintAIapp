import { randomUUID } from "node:crypto";
import { getDbPool } from "../db/postgres.js";

type DbRow = {
  id: string;
  company_id: string;
  project_id: string | null;
  job_id: string | null;
  scan_name: string | null;
  input_json: Record<string, unknown>;
  result_json: Record<string, unknown>;
  created_at: string;
};

export type WifiNetworkScanHistoryItem = {
  id: string;
  companyId: string;
  projectId: string | null;
  jobId: string | null;
  scanName: string | null;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  createdAt: string;
};

function mapRow(row: DbRow): WifiNetworkScanHistoryItem {
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    jobId: row.job_id,
    scanName: row.scan_name,
    input: row.input_json ?? {},
    result: row.result_json ?? {},
    createdAt: row.created_at
  };
}

export async function saveWifiNetworkScan(params: {
  companyId: string;
  projectId?: string;
  jobId?: string;
  scanName?: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}): Promise<WifiNetworkScanHistoryItem> {
  const pool = getDbPool();
  const id = randomUUID();
  const result = await pool.query<DbRow>(
    `
    INSERT INTO company_wifi_network_scans (
      id, company_id, project_id, job_id, scan_name, input_json, result_json
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
    RETURNING id, company_id, project_id, job_id, scan_name, input_json, result_json, created_at
    `,
    [
      id,
      params.companyId,
      params.projectId ?? null,
      params.jobId ?? null,
      params.scanName ?? null,
      JSON.stringify(params.input),
      JSON.stringify(params.result)
    ]
  );
  return mapRow(result.rows[0]);
}

export async function listWifiNetworkScans(params: {
  companyId: string;
  projectId?: string;
  jobId?: string;
  limit?: number;
}): Promise<WifiNetworkScanHistoryItem[]> {
  const pool = getDbPool();
  const result = await pool.query<DbRow>(
    `
    SELECT id, company_id, project_id, job_id, scan_name, input_json, result_json, created_at
    FROM company_wifi_network_scans
    WHERE company_id = $1
      AND ($2::text IS NULL OR project_id = $2)
      AND ($3::text IS NULL OR job_id = $3)
    ORDER BY created_at DESC
    LIMIT $4
    `,
    [params.companyId, params.projectId ?? null, params.jobId ?? null, params.limit ?? 25]
  );
  return result.rows.map((row) => mapRow(row));
}

export async function deleteWifiNetworkScan(params: {
  companyId: string;
  scanId: string;
}): Promise<boolean> {
  const pool = getDbPool();
  const result = await pool.query<{ id: string }>(
    `
    DELETE FROM company_wifi_network_scans
    WHERE company_id = $1
      AND id = $2
    RETURNING id
    `,
    [params.companyId, params.scanId]
  );

  return result.rows.length > 0;
}
