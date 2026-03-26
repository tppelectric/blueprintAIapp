import type {
  FloorPlanScanApiResponse,
  FloorPlanScanRoom,
} from "@/lib/tool-floor-plan-scan";

function normRoomKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function pickDim(a: number | null, b: number | null): number | null {
  if (a != null && a > 0 && b != null && b > 0) return Math.max(a, b);
  if (a != null && a > 0) return a;
  if (b != null && b > 0) return b;
  return null;
}

function mergeRoomPair(
  a: FloorPlanScanRoom,
  b: FloorPlanScanRoom,
): FloorPlanScanRoom {
  const sq = (x: number | null) => (x != null && x > 0 ? x : 0);
  const nextSq = Math.max(sq(a.sq_ft), sq(b.sq_ft));
  const mergedSq = nextSq > 0 ? nextSq : (a.sq_ft ?? b.sq_ft);
  return {
    room_name:
      a.room_name.length >= b.room_name.length ? a.room_name : b.room_name,
    room_type: a.room_type !== "other" ? a.room_type : b.room_type,
    width_ft: pickDim(a.width_ft, b.width_ft),
    length_ft: pickDim(a.length_ft, b.length_ft),
    sq_ft: mergedSq != null && mergedSq > 0 ? mergedSq : null,
    floor: a.floor ?? b.floor,
    confidence: Math.max(a.confidence, b.confidence),
  };
}

/**
 * Merge several per-page floor-plan scan API responses.
 * Rooms with the same normalized name count once; dimensions favor the larger plausible values.
 */
export function mergeFloorPlanRoomScanPages(
  parts: { page: number; data: FloorPlanScanApiResponse }[],
): FloorPlanScanApiResponse {
  const byKey = new Map<string, FloorPlanScanRoom>();
  const noteLines: string[] = [];
  const sugSet = new Set<string>();
  const suggestions: string[] = [];

  const sortedPages = [...parts].sort((x, y) => x.page - y.page);
  const pageLabel = sortedPages.map((p) => p.page).join(", ");
  if (pageLabel) {
    noteLines.push(`Combined from pages: ${pageLabel}`);
  }

  for (const { page, data } of sortedPages) {
    const sn = data.scan_notes?.trim();
    if (sn) noteLines.push(`Page ${page}: ${sn}`);
    for (const s of data.equipment_placement_suggestions ?? []) {
      const t = s.trim();
      if (t && !sugSet.has(t)) {
        sugSet.add(t);
        suggestions.push(t);
      }
    }
    for (const r of data.rooms ?? []) {
      const key = normRoomKey(r.room_name);
      if (!key) continue;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...r });
      } else {
        byKey.set(key, mergeRoomPair(existing, r));
      }
    }
  }

  return {
    rooms: [...byKey.values()],
    equipment_placement_suggestions: suggestions,
    scan_notes: noteLines.join("\n"),
  };
}
