import type { DetectedRoomRow } from "@/lib/detected-room-types";
import type { WifiRoomInput } from "@/lib/wifi-analyzer-engine";

const ROOM_TYPE_MAP: Record<string, WifiRoomInput["roomType"]> = {
  living_room: "living_room",
  bedroom: "bedroom",
  kitchen: "kitchen",
  bathroom: "bathroom",
  garage: "garage",
  dining_room: "other",
  hallway: "hallway",
  laundry: "other",
  outdoor: "outdoor",
  basement: "basement",
  office: "office",
  utility: "other",
  other: "other",
};

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function dimsFromSqFt(sq: number | null): { w: number; l: number } {
  if (sq != null && Number.isFinite(sq) && sq > 0) {
    const s = Math.sqrt(sq);
    const w = Math.max(6, Math.round(s / 1.25));
    const l = Math.max(6, Math.round(sq / w));
    return { w, l };
  }
  return { w: 12, l: 12 };
}

/** Maps blueprint detected rooms into Wi‑Fi analyzer room rows (best-effort). */
export function detectedRoomsToWifiInputs(
  rooms: DetectedRoomRow[],
  floorCount: number,
): WifiRoomInput[] {
  const floors = Math.min(4, Math.max(1, Math.round(floorCount))) as
    | 1
    | 2
    | 3
    | 4;
  return rooms.map((r) => {
    const rt = ROOM_TYPE_MAP[r.room_type] ?? "other";
    const w =
      r.width_ft != null && r.width_ft > 0
        ? Math.round(Number(r.width_ft))
        : null;
    const len =
      r.length_ft != null && r.length_ft > 0
        ? Math.round(Number(r.length_ft))
        : null;
    const sq = r.sq_ft != null ? Number(r.sq_ft) : null;
    let widthFt = w ?? 12;
    let lengthFt = len ?? 12;
    if (w == null || len == null) {
      const d = dimsFromSqFt(
        sq != null && Number.isFinite(sq) ? sq : null,
      );
      if (w == null) widthFt = d.w;
      if (len == null) lengthFt = d.l;
    }
    return {
      id: r.id?.trim() || newId(),
      name: r.room_name.trim() || "Room",
      floor: floors >= 2 ? 2 : 1,
      lengthFt,
      widthFt,
      roomType: rt,
      wallMaterial: "drywall",
      outdoor: rt === "outdoor" || rt === "garage",
      ceilingHeight: "9",
      expectedDevices: 8,
    };
  });
}

export const WIFI_PREFILL_STORAGE_KEY = "blueprint-wifi-prefill-v1";
