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

function normRoomKey(name: string, floorNumber: number): string {
  return `${name.trim().toLowerCase().replace(/\s+/g, " ")}::floor${floorNumber}`;
}

function pickDim(a: number | null, b: number | null): number | null {
  if (a != null && a > 0 && b != null && b > 0) return Math.max(a, b);
  if (a != null && a > 0) return a;
  if (b != null && b > 0) return b;
  return null;
}

/**
 * Deduplicate detected rooms by normalized room name across pages.
 * Same room appearing on multiple pages counts once.
 * Keeps the row from the lowest page number as the base; takes max sq_ft and highest confidence.
 */
export function dedupeDetectedRooms(rooms: DetectedRoomRow[]): DetectedRoomRow[] {
  const byKey = new Map<string, DetectedRoomRow>();
  const sorted = [...rooms].sort((a, b) => a.page_number - b.page_number);
  for (const r of sorted) {
    const key = normRoomKey(r.room_name, r.floor_number ?? 1);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...r });
    } else {
      const sq = (x: number | null) => (x != null && x > 0 ? x : 0);
      const nextSq = Math.max(sq(existing.sq_ft), sq(r.sq_ft));
      byKey.set(key, {
        ...existing,
        width_ft: pickDim(existing.width_ft, r.width_ft),
        length_ft: pickDim(existing.length_ft, r.length_ft),
        sq_ft: nextSq > 0 ? nextSq : (existing.sq_ft ?? r.sq_ft),
        confidence: Math.max(existing.confidence, r.confidence),
        room_name: existing.room_name.length >= r.room_name.length
          ? existing.room_name
          : r.room_name,
        room_type: existing.room_type !== "other" ? existing.room_type : r.room_type,
      });
    }
  }
  return [...byKey.values()];
}
