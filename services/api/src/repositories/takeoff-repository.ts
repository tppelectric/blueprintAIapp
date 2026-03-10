import {
  buildLightingCircuits,
  buildMaterialEstimate,
  buildRoomTakeoffs
} from "@package/shared";
import type {
  ElectricalSymbolType,
  LightingCircuit,
  MaterialEstimate,
  Room,
  RoomTakeoff,
  SymbolDetection
} from "@package/shared";
import { getDbPool } from "../db/postgres.js";

type PgRow = Record<string, unknown>;

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

function normalizeSymbolType(value: unknown): ElectricalSymbolType {
  const raw = String(value ?? "").toLowerCase().trim();
  if (ALLOWED_SYMBOL_TYPES.has(raw as ElectricalSymbolType)) {
    return raw as ElectricalSymbolType;
  }
  if (raw === "receptacle") {
    return "outlet";
  }
  return "unknown";
}

function mapRoomRow(row: PgRow): Room {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    jobId: row.job_id ? String(row.job_id) : null,
    sheetId: String(row.blueprint_id ?? ""),
    name: String(row.name),
    areaSqFt: Number(row.area_sq_ft ?? 0)
  };
}

function mapSymbolRow(row: PgRow): SymbolDetection {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    jobId: row.job_id ? String(row.job_id) : null,
    sheetId: String(row.blueprint_id ?? ""),
    roomId: String(row.room_id ?? ""),
    symbolType: normalizeSymbolType(row.symbol_type),
    confidence: Number(row.confidence ?? 0),
    legendMatchLabel: row.legend_match_label ? String(row.legend_match_label) : undefined,
    needsReview: Boolean(row.needs_review)
  };
}

export async function getTakeoffSummaryForProject(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
}): Promise<{
  takeoffs: RoomTakeoff[];
  circuits: LightingCircuit[];
  materials: MaterialEstimate[];
} | null> {
  const pool = getDbPool();
  const [roomsResult, symbolsResult] = await Promise.all([
    pool.query(
      `
      SELECT id, project_id, job_id, blueprint_id, name, area_sq_ft
      FROM project_rooms
      WHERE company_id = $1
        AND project_id = $2
        AND ($3::text IS NULL OR job_id = $3)
      ORDER BY name ASC
      `,
      [params.companyId, params.projectId, params.jobId ?? null]
    ),
    pool.query(
      `
      SELECT id, project_id, job_id, blueprint_id, room_id, symbol_type, confidence, legend_match_label, needs_review
      FROM project_symbol_detections
      WHERE company_id = $1
        AND project_id = $2
        AND ($3::text IS NULL OR job_id = $3)
      ORDER BY created_at ASC
      `,
      [params.companyId, params.projectId, params.jobId ?? null]
    )
  ]);

  const rooms = (roomsResult.rows as PgRow[]).map((row: PgRow) => mapRoomRow(row));
  const symbols = (symbolsResult.rows as PgRow[]).map((row: PgRow) => mapSymbolRow(row));

  if (rooms.length === 0 && symbols.length === 0) {
    return null;
  }

  const takeoffs = buildRoomTakeoffs(rooms, symbols);
  const circuits = buildLightingCircuits(takeoffs);
  const materials = buildMaterialEstimate(takeoffs).map((item) => ({
    ...item,
    id: `${params.projectId}-${item.itemCode}`,
    projectId: params.projectId,
    jobId: params.jobId ?? null
  }));

  return { takeoffs, circuits, materials };
}
