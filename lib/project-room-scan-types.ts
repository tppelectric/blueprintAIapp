import type { DetectedRoomRow } from "@/lib/detected-room-types";

export type ProjectRoomScanRow = {
  id: string;
  project_id: string;
  rooms_json: DetectedRoomRow[] | unknown;
  total_sqft: number;
  floor_count: number;
  scan_page: number;
  scan_label: string;
  created_at: string;
};

export function parseRoomsJson(raw: unknown): DetectedRoomRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x) => x && typeof x === "object" && typeof (x as DetectedRoomRow).id === "string",
  ) as DetectedRoomRow[];
}
