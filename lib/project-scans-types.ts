import type { ProjectRoomScanRow } from "@/lib/project-room-scans";
import type { SavedScanRow } from "@/lib/saved-scan-types";

export type ProjectScansSummary = {
  totalRooms: number;
  totalSqFt: number;
  totalItems: number;
  lastScanned: string | null;
  hasRoomScan: boolean;
  hasElectricalScan: boolean;
};

export type ProjectScansPayload = {
  roomScans: ProjectRoomScanRow[];
  electricalScans: SavedScanRow[];
  fullScans: SavedScanRow[];
  latestRoomScan: ProjectRoomScanRow | null;
  latestElectricalScan: SavedScanRow | null;
  summary: ProjectScansSummary;
};

export function normalizeSavedScanType(
  raw: string | null | undefined,
): "electrical" | "full" | "room" | "target" {
  if (raw === "full" || raw === "room" || raw === "target") return raw;
  return "electrical";
}
