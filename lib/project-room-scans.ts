import type {
  FloorPlanScanApiResponse,
  FloorPlanScanRoom,
} from "@/lib/tool-floor-plan-scan";

/** Row shape from `public.project_room_scans`. */
export type ProjectRoomScanRow = {
  id: string;
  project_id: string;
  created_at: string;
  scan_page: number;
  rooms_json: unknown;
  equipment_suggestions_json?: unknown;
  scan_notes?: string | null;
  total_sqft: number | null;
  floor_count: number | null;
  /** Optional label from /api/project-room-scans POST (analyze-rooms history). */
  scan_label?: string | null;
};

export type ProjectRoomScanListItem = ProjectRoomScanRow & {
  room_count: number;
};

export function parseRoomsJson(raw: unknown): FloorPlanScanRoom[] {
  if (!Array.isArray(raw)) return [];
  return raw as FloorPlanScanRoom[];
}

export function parseSuggestionsJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x).trim()).filter(Boolean);
}

export function projectRoomScanRowToResponse(
  row: ProjectRoomScanRow,
): FloorPlanScanApiResponse {
  return {
    rooms: parseRoomsJson(row.rooms_json),
    equipment_placement_suggestions: parseSuggestionsJson(
      row.equipment_suggestions_json,
    ),
    scan_notes: String(row.scan_notes ?? "").trim(),
  };
}

export function summarizeScanRow(row: ProjectRoomScanRow): ProjectRoomScanListItem {
  const rooms = parseRoomsJson(row.rooms_json);
  return {
    ...row,
    room_count: rooms.length,
  };
}

export function formatRoomScanBannerDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
