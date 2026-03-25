import type { ElectricalItemRow } from "@/lib/electrical-item-types";
import type { DetectedRoomRow } from "@/lib/detected-room-types";

export type SavedScanType =
  | "electrical"
  | "room"
  | "full"
  | "target";

export type SavedScanRow = {
  id: string;
  project_id: string;
  page_number: number;
  scan_name: string;
  scan_date: string;
  /** Scan mode from analyze-page request when present (e.g. batch / single). */
  scan_mode?: string | null;
  /** How this row should be grouped in the scan library. */
  scan_type?: SavedScanType | string | null;
  /** Floor-plan AI rooms stored with full snapshots (optional). */
  plan_rooms_json?: unknown;
  items_snapshot: ElectricalItemRow[] | unknown;
  rooms_snapshot: DetectedRoomRow[] | unknown;
  total_items: number;
  notes: string | null;
  created_at: string;
};

export function parseScanItems(snapshot: unknown): ElectricalItemRow[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot as ElectricalItemRow[];
}

export function parseScanRooms(snapshot: unknown): DetectedRoomRow[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot as DetectedRoomRow[];
}
