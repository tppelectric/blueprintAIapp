import { randomUUID } from "node:crypto";

import type {
  BlueprintProcessingRunSummary,
  ScannerDetectedSheet,
  ScannerExtractResult
} from "@package/shared";
import { getDbPool } from "../db/postgres.js";

type DeviceCounts = {
  totals: Record<string, number>;
  byRoom: Record<string, Record<string, number>>;
};

export async function saveBlueprintProcessingRun(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  fileName: string;
  scanMode: string;
  sheets: ScannerDetectedSheet[];
  detectedRooms: string[];
  deviceCounts: DeviceCounts;
  extractions: ScannerExtractResult[];
}): Promise<{ runId: string }> {
  const pool = getDbPool();
  const runId = randomUUID();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO blueprint_processing_runs (
        id,
        company_id,
        project_id,
        job_id,
        source_file_name,
        scan_mode,
        processed_sheets,
        detected_rooms_json,
        device_counts_json,
        extraction_payload_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)
      `,
      [
        runId,
        params.companyId,
        params.projectId,
        params.jobId ?? null,
        params.fileName,
        params.scanMode,
        params.sheets.length,
        JSON.stringify(params.detectedRooms),
        JSON.stringify(params.deviceCounts),
        JSON.stringify(params.extractions)
      ]
    );

    for (let index = 0; index < params.sheets.length; index += 1) {
      const sheet = params.sheets[index];
      const extraction = params.extractions[index];
      const sheetResultId = randomUUID();

      await client.query(
        `
        INSERT INTO blueprint_processing_sheet_results (
          id,
          run_id,
          company_id,
          project_id,
          job_id,
          sheet_number,
          sheet_title,
          page_number,
          symbols_detected,
          rooms_detected,
          notes_detected
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `,
        [
          sheetResultId,
          runId,
          params.companyId,
          params.projectId,
          params.jobId ?? null,
          sheet.sheet_number,
          sheet.title,
          sheet.page_number,
          extraction?.symbols?.length ?? 0,
          extraction?.rooms?.length ?? 0,
          extraction?.notes?.length ?? 0
        ]
      );
    }

    await client.query("COMMIT");
    return { runId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listBlueprintProcessingRuns(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  limit?: number;
}): Promise<BlueprintProcessingRunSummary[]> {
  const pool = getDbPool();

  const result = await pool.query<{
    id: string;
    company_id: string;
    project_id: string;
    job_id: string | null;
    source_file_name: string;
    scan_mode: string;
    processed_sheets: number;
    detected_rooms_json: unknown;
    created_at: string;
  }>(
    `
    SELECT
      id,
      company_id,
      project_id,
      job_id,
      source_file_name,
      scan_mode,
      processed_sheets,
      detected_rooms_json,
      created_at
    FROM blueprint_processing_runs
    WHERE company_id = $1
      AND project_id = $2
      AND ($3::text IS NULL OR job_id = $3)
    ORDER BY created_at DESC
    LIMIT $4
    `,
    [params.companyId, params.projectId, params.jobId ?? null, params.limit ?? 20]
  );

  return result.rows.map((row) => {
    const rooms = Array.isArray(row.detected_rooms_json) ? row.detected_rooms_json : [];

    return {
      runId: row.id,
      companyId: row.company_id,
      projectId: row.project_id,
      jobId: row.job_id,
      sourceFileName: row.source_file_name,
      scanMode: row.scan_mode,
      processedSheets: row.processed_sheets,
      detectedRoomsCount: rooms.length,
      createdAt: row.created_at
    };
  });
}
