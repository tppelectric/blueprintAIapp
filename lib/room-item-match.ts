import type { DetectedRoomRow } from "@/lib/detected-room-types";
import type { ElectricalItemRow } from "@/lib/electrical-item-types";

export function normalizeRoomLabel(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/** Display/storage default when missing */
export function displayWhichRoom(row: Pick<ElectricalItemRow, "which_room">): string {
  const w = row.which_room?.trim();
  if (!w) return "UNASSIGNED";
  return w;
}

export function itemMatchesDetectedRoom(
  item: Pick<ElectricalItemRow, "which_room">,
  room: Pick<DetectedRoomRow, "room_name">,
): boolean {
  const a = normalizeRoomLabel(displayWhichRoom(item));
  const b = normalizeRoomLabel(room.room_name);
  return a === b && a !== "" && a !== "UNASSIGNED";
}

export function isItemUnassignedForPage(
  item: Pick<ElectricalItemRow, "which_room">,
  pageRooms: Pick<DetectedRoomRow, "room_name">[],
): boolean {
  const key = normalizeRoomLabel(displayWhichRoom(item));
  if (key === "" || key === "UNASSIGNED") return true;
  return !pageRooms.some((r) => itemMatchesDetectedRoom(item, r));
}

export function roomIndexOnPage(
  roomId: string,
  pageRooms: DetectedRoomRow[],
): number {
  const idx = pageRooms.findIndex((r) => r.id === roomId);
  return idx >= 0 ? idx : 0;
}

/** Hue slot for manual-count dots: detected room index, or `pageRooms.length` for UNASSIGNED. */
export function roomHueIndexForManualDots(
  countingRoomId: string | "UNASSIGNED",
  pageRooms: DetectedRoomRow[],
): number {
  if (countingRoomId === "UNASSIGNED") return pageRooms.length;
  const idx = pageRooms.findIndex((r) => r.id === countingRoomId);
  return idx >= 0 ? idx : pageRooms.length;
}

export function electricalItemsForManualRoom(
  pageItems: ElectricalItemRow[],
  countingRoomId: string | "UNASSIGNED",
  pageRooms: Pick<DetectedRoomRow, "id" | "room_name">[],
): ElectricalItemRow[] {
  if (countingRoomId === "UNASSIGNED") {
    return pageItems.filter((i) => isItemUnassignedForPage(i, pageRooms));
  }
  const room = pageRooms.find((r) => r.id === countingRoomId);
  if (!room) return [];
  return pageItems.filter((i) => itemMatchesDetectedRoom(i, room));
}
