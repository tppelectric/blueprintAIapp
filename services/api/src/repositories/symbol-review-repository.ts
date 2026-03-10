import { randomUUID } from "node:crypto";

import type { ElectricalSymbolType, SymbolDetection } from "@package/shared";
import { getDbPool } from "../db/postgres.js";

type DbSymbolRow = {
  id: string;
  project_id: string;
  job_id: string | null;
  blueprint_id: string | null;
  room_id: string | null;
  symbol_type: string;
  confidence: number;
  legend_match_label: string | null;
  needs_review: boolean;
};

const ALLOWED_SYMBOL_TYPES: Set<ElectricalSymbolType> = new Set([
  "outlet",
  "switch",
  "dimmer",
  "light",
  "recessed_light",
  "fan",
  "cat6",
  "speaker",
  "camera",
  "smoke_co",
  "unknown"
]);

function normalizeSymbolType(value: string): ElectricalSymbolType {
  const raw = value.trim().toLowerCase();
  if (ALLOWED_SYMBOL_TYPES.has(raw as ElectricalSymbolType)) {
    return raw as ElectricalSymbolType;
  }
  if (raw === "receptacle") {
    return "outlet";
  }
  return "unknown";
}

function mapSymbol(row: DbSymbolRow): SymbolDetection {
  return {
    id: row.id,
    projectId: row.project_id,
    jobId: row.job_id,
    sheetId: row.blueprint_id ?? "",
    roomId: row.room_id ?? "",
    symbolType: normalizeSymbolType(row.symbol_type),
    confidence: Number(row.confidence ?? 0),
    legendMatchLabel: row.legend_match_label ?? undefined,
    needsReview: Boolean(row.needs_review)
  };
}

export async function listProjectReviewQueue(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
}): Promise<SymbolDetection[]> {
  const pool = getDbPool();
  const result = await pool.query<DbSymbolRow>(
    `
    SELECT id, project_id, job_id, blueprint_id, room_id, symbol_type, confidence, legend_match_label, needs_review
    FROM project_symbol_detections
    WHERE company_id = $1
      AND project_id = $2
      AND ($3::text IS NULL OR job_id = $3)
      AND needs_review = TRUE
    ORDER BY created_at ASC
    `,
    [params.companyId, params.projectId, params.jobId ?? null]
  );

  return result.rows.map((row) => mapSymbol(row));
}

export async function confirmProjectSymbol(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  detectionId: string;
  confirmedType: ElectricalSymbolType;
}): Promise<SymbolDetection | null> {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const current = await client.query<DbSymbolRow>(
      `
      SELECT id, project_id, job_id, blueprint_id, room_id, symbol_type, confidence, legend_match_label, needs_review
      FROM project_symbol_detections
      WHERE company_id = $1
        AND project_id = $2
        AND id = $3
        AND ($4::text IS NULL OR job_id = $4)
      LIMIT 1
      `,
      [params.companyId, params.projectId, params.detectionId, params.jobId ?? null]
    );

    if (current.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const previous = normalizeSymbolType(current.rows[0].symbol_type);
    const updatedRow = await client.query<DbSymbolRow>(
      `
      UPDATE project_symbol_detections
      SET symbol_type = $4,
          needs_review = FALSE
      WHERE company_id = $1
        AND project_id = $2
        AND id = $3
        AND ($5::text IS NULL OR job_id = $5)
      RETURNING id, project_id, job_id, blueprint_id, room_id, symbol_type, confidence, legend_match_label, needs_review
      `,
      [params.companyId, params.projectId, params.detectionId, params.confirmedType, params.jobId ?? null]
    );

    const updated = updatedRow.rows[0];
    const symbolKey = updated.legend_match_label?.trim() || `manual:${params.detectionId}`;
    await client.query(
      `
      INSERT INTO project_symbol_library (
        id,
        company_id,
        symbol_key,
        confirmed_symbol_type,
        notes
      ) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (company_id, symbol_key)
      DO UPDATE SET confirmed_symbol_type = EXCLUDED.confirmed_symbol_type
      `,
      [
        randomUUID(),
        params.companyId,
        symbolKey,
        params.confirmedType,
        updated.legend_match_label ? "Confirmed from symbol review queue." : "Manual symbol confirmation."
      ]
    );

    await client.query(
      `
      INSERT INTO project_symbol_corrections (
        id,
        company_id,
        project_id,
        job_id,
        detection_id,
        previous_symbol_type,
        corrected_symbol_type
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        randomUUID(),
        params.companyId,
        params.projectId,
        params.jobId ?? null,
        params.detectionId,
        previous,
        params.confirmedType
      ]
    );

    await client.query("COMMIT");
    return mapSymbol(updated);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
