import { randomUUID } from "node:crypto";

import type { ScannerDetectedSheet, ScannerExtractResult } from "@package/shared";
import { getDbPool } from "../db/postgres.js";

const ALLOWED_SYMBOL_TYPES = new Set([
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

function normalizeSymbolType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (ALLOWED_SYMBOL_TYPES.has(normalized)) {
    return normalized;
  }
  if (normalized === "receptacle") {
    return "outlet";
  }
  return "unknown";
}

function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function normalizeRoomBaseName(value: string): string {
  const cleaned = value
    .replace(/\([^)]*\)/g, " ")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.toLowerCase();
}

function toRoomLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Unlabeled Area";
  }
  return trimmed
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\s+/g, " ");
}

function inferFloorLabelFromSheetTitle(title: string | null | undefined): string {
  const text = (title ?? "").toLowerCase();
  if (/\bbasement\b|\bbsmt\b/.test(text)) {
    return "Basement";
  }
  if (/\bfirst\b|\b1st\b/.test(text)) {
    return "First Floor";
  }
  if (/\bsecond\b|\b2nd\b/.test(text)) {
    return "Second Floor";
  }
  if (/\bthird\b|\b3rd\b/.test(text)) {
    return "Third Floor";
  }
  if (/\bfourth\b|\b4th\b/.test(text)) {
    return "Fourth Floor";
  }
  if (/\battic\b/.test(text)) {
    return "Attic";
  }
  if (/\broof\b/.test(text)) {
    return "Roof";
  }
  return "Unspecified Floor";
}

function parseFloorFromRoomName(name: string): string | null {
  const match = name.match(/\(([^)]+)\)\s*$/);
  if (!match) {
    return null;
  }
  const floor = match[1]?.trim();
  return floor || null;
}

export async function saveBlueprintImportResult(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
  source: string;
  fileName: string;
  manualScale?: string;
  scanMode: string;
  sheets: ScannerDetectedSheet[];
  extractions: ScannerExtractResult[];
}): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingRoomsResult = await client.query<{
      id: string;
      name: string;
      area_sq_ft: number | null;
    }>(
      `
      SELECT id, name, area_sq_ft
      FROM project_rooms
      WHERE company_id = $1
        AND project_id = $2
        AND ($3::text IS NULL OR job_id = $3)
      `,
      [params.companyId, params.projectId, params.jobId ?? null]
    );

    const incomingRoomRefs: Array<{
      sheetIndex: number;
      rawRoomName: string;
      roomBaseKey: string;
      roomDisplayBase: string;
      floorLabel: string;
      areaSqFt: number;
    }> = [];

    for (let sheetIndex = 0; sheetIndex < params.sheets.length; sheetIndex += 1) {
      const sheet = params.sheets[sheetIndex];
      const extraction = params.extractions[sheetIndex];
      const floorLabel = inferFloorLabelFromSheetTitle(sheet.title);

      for (const room of extraction.rooms) {
        const baseDisplay = toRoomLabel(String(room.name ?? ""));
        incomingRoomRefs.push({
          sheetIndex,
          rawRoomName: String(room.name ?? ""),
          roomBaseKey: normalizeRoomBaseName(baseDisplay),
          roomDisplayBase: baseDisplay,
          floorLabel,
          areaSqFt: Number(room.area_sq_ft ?? 0)
        });
      }
    }

    const floorsByRoomBase = new Map<string, Set<string>>();
    for (const existing of existingRoomsResult.rows) {
      const existingFloor = parseFloorFromRoomName(existing.name) ?? "Unspecified Floor";
      const existingBase = normalizeRoomBaseName(existing.name);
      if (!floorsByRoomBase.has(existingBase)) {
        floorsByRoomBase.set(existingBase, new Set());
      }
      floorsByRoomBase.get(existingBase)!.add(existingFloor);
    }
    for (const incoming of incomingRoomRefs) {
      if (!floorsByRoomBase.has(incoming.roomBaseKey)) {
        floorsByRoomBase.set(incoming.roomBaseKey, new Set());
      }
      floorsByRoomBase.get(incoming.roomBaseKey)!.add(incoming.floorLabel);
    }

    function buildCanonicalRoomName(roomBaseKey: string, displayBase: string, floorLabel: string): string {
      const floors = floorsByRoomBase.get(roomBaseKey);
      const hasMultipleFloors = Boolean(floors && floors.size > 1);
      return hasMultipleFloors ? `${displayBase} (${floorLabel})` : displayBase;
    }

    const roomIdByCanonicalName = new Map<string, string>();
    const roomAreaByCanonicalName = new Map<string, number>();
    for (const existing of existingRoomsResult.rows) {
      const roomNameKey = String(existing.name).toLowerCase();
      roomIdByCanonicalName.set(roomNameKey, existing.id);
      roomAreaByCanonicalName.set(roomNameKey, Number(existing.area_sq_ft ?? 0));
    }

    for (let index = 0; index < params.sheets.length; index += 1) {
      const sheet = params.sheets[index];
      const extraction = params.extractions[index];
      let blueprintId: string = randomUUID();
      const planScale = extraction?.detected_scale?.trim() || params.manualScale?.trim() || "USER_INPUT_REQUIRED";
      const existingBlueprintResult = await client.query<{ id: string }>(
        `
        SELECT id
        FROM project_blueprints
        WHERE company_id = $1
          AND project_id = $2
          AND ($3::text IS NULL OR job_id = $3)
          AND file_name = $4
          AND sheet_number = $5
          AND page_number = $6
        LIMIT 1
        `,
        [params.companyId, params.projectId, params.jobId ?? null, params.fileName, sheet.sheet_number, sheet.page_number]
      );

      if (existingBlueprintResult.rows.length > 0) {
        blueprintId = existingBlueprintResult.rows[0].id;
        await client.query(
          `
          DELETE FROM project_symbol_detections
          WHERE company_id = $1
            AND project_id = $2
            AND ($3::text IS NULL OR job_id = $3)
            AND blueprint_id = $4
          `,
          [params.companyId, params.projectId, params.jobId ?? null, blueprintId]
        );
        await client.query(
          `
          DELETE FROM project_notes
          WHERE company_id = $1
            AND project_id = $2
            AND ($3::text IS NULL OR job_id = $3)
            AND blueprint_id = $4
          `,
          [params.companyId, params.projectId, params.jobId ?? null, blueprintId]
        );
        await client.query(
          `
          DELETE FROM project_legend_symbols
          WHERE company_id = $1
            AND project_id = $2
            AND ($3::text IS NULL OR job_id = $3)
            AND blueprint_id = $4
          `,
          [params.companyId, params.projectId, params.jobId ?? null, blueprintId]
        );

        await client.query(
          `
          UPDATE project_blueprints
          SET
            title = $5,
            plan_scale = $6,
            scan_mode = $7
          WHERE id = $1
            AND company_id = $2
            AND project_id = $3
            AND ($4::text IS NULL OR job_id = $4)
          `,
          [blueprintId, params.companyId, params.projectId, params.jobId ?? null, sheet.title, planScale, params.scanMode]
        );
      } else {
        await client.query(
          `
          INSERT INTO project_blueprints (
            id,
            company_id,
            project_id,
            job_id,
            source,
            file_name,
            sheet_number,
            title,
            page_number,
            plan_scale,
            scan_mode
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          `,
          [
            blueprintId,
            params.companyId,
            params.projectId,
            params.jobId ?? null,
            params.source,
            params.fileName,
            sheet.sheet_number,
            sheet.title,
            sheet.page_number,
            planScale,
            params.scanMode
          ]
        );
      }

      const roomIdByRawName = new Map<string, string>();
      const floorLabel = inferFloorLabelFromSheetTitle(sheet.title);
      for (const room of extraction.rooms) {
        const displayBase = toRoomLabel(String(room.name ?? ""));
        const roomBaseKey = normalizeRoomBaseName(displayBase);
        const canonicalRoomName = buildCanonicalRoomName(roomBaseKey, displayBase, floorLabel);
        const canonicalRoomNameKey = canonicalRoomName.toLowerCase();
        let roomId = roomIdByCanonicalName.get(canonicalRoomNameKey);

        if (!roomId) {
          roomId = randomUUID();
          roomIdByCanonicalName.set(canonicalRoomNameKey, roomId);
          roomAreaByCanonicalName.set(canonicalRoomNameKey, Number(room.area_sq_ft ?? 0));

          await client.query(
            `
            INSERT INTO project_rooms (
              id,
              company_id,
              project_id,
              job_id,
              blueprint_id,
              name,
              area_sq_ft
            ) VALUES ($1,$2,$3,$4,$5,$6,$7)
            `,
            [roomId, params.companyId, params.projectId, params.jobId ?? null, blueprintId, canonicalRoomName, room.area_sq_ft]
          );
        } else {
          const currentArea = roomAreaByCanonicalName.get(canonicalRoomNameKey) ?? 0;
          const incomingArea = Number(room.area_sq_ft ?? 0);
          if (incomingArea > currentArea) {
            await client.query(
              `
              UPDATE project_rooms
              SET area_sq_ft = $4
              WHERE id = $1
                AND company_id = $2
                AND project_id = $3
              `,
              [roomId, params.companyId, params.projectId, incomingArea]
            );
            roomAreaByCanonicalName.set(canonicalRoomNameKey, incomingArea);
          }
        }

        roomIdByRawName.set(String(room.name ?? "").toLowerCase(), roomId);
      }

      for (const symbol of extraction.symbols) {
        const symbolType = normalizeSymbolType(String(symbol.type));
        const confidence = normalizeConfidence(Number(symbol.confidence));
        const bbox = Array.isArray(symbol.bbox) && symbol.bbox.length === 4 ? symbol.bbox : null;

        await client.query(
          `
          INSERT INTO project_symbol_detections (
            id,
            company_id,
            project_id,
            job_id,
            blueprint_id,
            room_id,
            symbol_type,
            confidence,
            legend_match_label,
            needs_review,
            bbox_json,
            page_number,
            detection_source,
            ai_candidate_type,
            legend_similarity_score
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          `,
          [
            randomUUID(),
            params.companyId,
            params.projectId,
            params.jobId ?? null,
            blueprintId,
            symbol.room ? roomIdByRawName.get(String(symbol.room).toLowerCase()) ?? null : null,
            symbolType,
            confidence,
            symbol.legend_match ?? null,
            Boolean(symbol.needs_review),
            bbox ? JSON.stringify({ x1: bbox[0], y1: bbox[1], x2: bbox[2], y2: bbox[3] }) : null,
            symbol.page_number ?? null,
            symbol.detection_source ?? null,
            symbol.ai_candidate_type ?? null,
            symbol.legend_similarity ?? null
          ]
        );
      }

      for (const legend of extraction.legends) {
        const symbolClass = legend.symbol_class?.trim().toLowerCase();
        await client.query(
          `
          INSERT INTO project_legend_symbols (
            id,
            company_id,
            project_id,
            job_id,
            blueprint_id,
            symbol_image,
            symbol_description,
            symbol_class,
            source_page_number,
            needs_review
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `,
          [
            randomUUID(),
            params.companyId,
            params.projectId,
            params.jobId ?? null,
            blueprintId,
            legend.symbol_image ?? null,
            legend.description,
            symbolClass && symbolClass !== "unknown" ? symbolClass : null,
            legend.page_number ?? null,
            !symbolClass || symbolClass === "unknown"
          ]
        );
      }

      for (const note of extraction.notes) {
        const category = note.category === "electrical" ? "electrical" : "general";
        await client.query(
          `
          INSERT INTO project_notes (
            id,
            company_id,
            project_id,
            job_id,
            blueprint_id,
            category,
            note_text,
            impacts_scope
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          `,
          [
            randomUUID(),
            params.companyId,
            params.projectId,
            params.jobId ?? null,
            blueprintId,
            category,
            note.text,
            Boolean(note.impacts_scope)
          ]
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getLatestImportedFileForProject(params: {
  companyId: string;
  projectId: string;
  jobId?: string;
}): Promise<string | null> {
  const pool = getDbPool();
  const result = await pool.query<{ file_name: string }>(
    `
    SELECT file_name
    FROM project_blueprints
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
  return result.rows[0].file_name;
}
