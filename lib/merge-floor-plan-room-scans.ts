import type {
  FloorPlanScanApiResponse,
  FloorPlanScanRoom,
} from "@/lib/tool-floor-plan-scan";
import {
  mergeRoomsByFloorAndSimilarName,
  pickDim,
} from "@/lib/room-name-dedup";
import {
  isRoomCountSource,
  type RoomScanSheetType,
} from "@/lib/room-scan-sheet-type";

function mergeRoomPair(
  a: FloorPlanScanRoom,
  b: FloorPlanScanRoom,
): FloorPlanScanRoom {
  const sq = (x: number | null) => (x != null && x > 0 ? x : 0);
  const aSq = sq(a.sq_ft);
  const bSq = sq(b.sq_ft);
  let mergedSq: number | null;
  if (aSq > 0 && bSq > 0) {
    if (aSq !== bSq) {
      mergedSq = Math.max(aSq, bSq);
    } else {
      mergedSq = a.confidence >= b.confidence ? a.sq_ft : b.sq_ft;
    }
  } else {
    const nextSq = Math.max(aSq, bSq);
    mergedSq = nextSq > 0 ? nextSq : (a.sq_ft ?? b.sq_ft);
  }
  return {
    room_name:
      a.room_name.length >= b.room_name.length ? a.room_name : b.room_name,
    room_type: a.room_type !== "other" ? a.room_type : b.room_type,
    width_ft: pickDim(a.width_ft, b.width_ft),
    length_ft: pickDim(a.length_ft, b.length_ft),
    sq_ft: mergedSq != null && mergedSq > 0 ? mergedSq : null,
    floor: a.floor ?? b.floor ?? 1,
    confidence: Math.max(a.confidence, b.confidence),
  };
}

function roomFloor(r: FloorPlanScanRoom): number {
  return r.floor != null && r.floor >= 0 ? Math.round(r.floor) : 1;
}

/**
 * Merge several per-page floor-plan scan API responses.
 * Rooms on the same floor with clearly similar names count once.
 */
export function mergeFloorPlanRoomScanPages(
  parts: {
    page: number;
    data: FloorPlanScanApiResponse;
    sheetType?: RoomScanSheetType;
  }[],
): FloorPlanScanApiResponse {
  const noteLines: string[] = [];
  const sugSet = new Set<string>();
  const suggestions: string[] = [];

  const sortedPages = [...parts].sort((x, y) => x.page - y.page);
  const contributing = sortedPages.filter(
    (p) => !p.sheetType || isRoomCountSource(p.sheetType),
  );
  const pageLabel = contributing.map((p) => p.page).join(", ");
  if (pageLabel) {
    noteLines.push(`Combined from pages: ${pageLabel}`);
  }

  const allRooms: FloorPlanScanRoom[] = [];
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
      if (r.room_name?.trim()) allRooms.push({ ...r });
    }
  }

  const rooms = mergeRoomsByFloorAndSimilarName(
    allRooms,
    roomFloor,
    (r) => r.room_name,
    mergeRoomPair,
  );

  return {
    rooms,
    equipment_placement_suggestions: suggestions,
    scan_notes: noteLines.join("\n"),
  };
}
