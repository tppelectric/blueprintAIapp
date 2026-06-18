import {
  mergeRoomsByFloorAndSimilarName,
  pickDim,
} from "@/lib/room-name-dedup";

export type DetectedRoomRow = {
  id: string;
  project_id: string;
  page_number: number;
  floor_number: number;
  room_name: string;
  room_type: string;
  width_ft: number | null;
  length_ft: number | null;
  sq_ft: number | null;
  confidence: number;
  created_at?: string;
};

function roomFloor(r: DetectedRoomRow): number {
  return r.floor_number != null && r.floor_number >= 0 ? r.floor_number : 1;
}

function mergeDetectedPair(
  existing: DetectedRoomRow,
  incoming: DetectedRoomRow,
): DetectedRoomRow {
  const sq = (x: number | null) => (x != null && x > 0 ? x : 0);
  const eSq = sq(existing.sq_ft);
  const iSq = sq(incoming.sq_ft);
  let mergedSq: number | null;
  if (eSq > 0 && iSq > 0) {
    if (eSq !== iSq) {
      mergedSq = Math.max(eSq, iSq);
    } else {
      mergedSq =
        existing.confidence >= incoming.confidence
          ? existing.sq_ft
          : incoming.sq_ft;
    }
  } else {
    const nextSq = Math.max(eSq, iSq);
    mergedSq = nextSq > 0 ? nextSq : (existing.sq_ft ?? incoming.sq_ft);
  }
  return {
    ...existing,
    width_ft: pickDim(existing.width_ft, incoming.width_ft),
    length_ft: pickDim(existing.length_ft, incoming.length_ft),
    sq_ft: mergedSq,
    confidence: Math.max(existing.confidence, incoming.confidence),
    room_name:
      existing.room_name.length >= incoming.room_name.length
        ? existing.room_name
        : incoming.room_name,
    room_type:
      existing.room_type !== "other" ? existing.room_type : incoming.room_type,
    page_number: Math.min(existing.page_number, incoming.page_number),
  };
}

/**
 * Deduplicate detected rooms by floor + conservative similar-name matching.
 * Same room on multiple pages counts once.
 */
export function dedupeDetectedRooms(rooms: DetectedRoomRow[]): DetectedRoomRow[] {
  const sorted = [...rooms].sort((a, b) => a.page_number - b.page_number);
  return mergeRoomsByFloorAndSimilarName(
    sorted,
    roomFloor,
    (r) => r.room_name,
    mergeDetectedPair,
  );
}
