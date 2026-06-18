/**
 * Sheet-type classification for room scans.
 * Picks one authoritative room-count source per floor.
 */

export type RoomScanSheetType =
  | "architectural_floor_plan"
  | "rcp"
  | "power_plan"
  | "fixture_schedule"
  | "spec_detail"
  | "legend"
  | "other";

const ROOM_SOURCE_PRIORITY: Record<RoomScanSheetType, number> = {
  architectural_floor_plan: 3,
  rcp: 2,
  power_plan: 1,
  other: 0,
  fixture_schedule: -1,
  spec_detail: -1,
  legend: -1,
};

const VALID_TYPES = new Set<RoomScanSheetType>([
  "architectural_floor_plan",
  "rcp",
  "power_plan",
  "fixture_schedule",
  "spec_detail",
  "legend",
  "other",
]);

export function parseRoomScanSheetType(raw: unknown): RoomScanSheetType {
  const t = String(raw ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  if (VALID_TYPES.has(t as RoomScanSheetType)) return t as RoomScanSheetType;
  if (t.includes("architectural") || t === "floor_plan") {
    return "architectural_floor_plan";
  }
  if (t.includes("rcp") || t.includes("reflected") || t.includes("ceiling")) {
    return "rcp";
  }
  if (t.includes("power") || t.includes("electrical_plan")) {
    return "power_plan";
  }
  if (t.includes("fixture") || t.includes("lighting") || t.includes("luminaire")) {
    return "fixture_schedule";
  }
  if (t.includes("legend") || t.includes("keynote")) return "legend";
  if (t.includes("spec") || t.includes("detail") || t.includes("section")) {
    return "spec_detail";
  }
  return "other";
}

export function isRoomCountSource(type: RoomScanSheetType): boolean {
  return ROOM_SOURCE_PRIORITY[type] > 0;
}

/** Regex fallback when AI sheet_title is available but sheet_type is weak. */
export function inferSheetTypeFromTitle(title: string): RoomScanSheetType | null {
  const t = title.toLowerCase();
  if (/\b(rcp|reflected\s*ceiling|ceiling\s*plan)\b/.test(t)) return "rcp";
  if (
    /\b(fixture|lighting|luminaire)\s*(schedule|plan)\b/.test(t) ||
    /\blighting\s*fixture\b/.test(t)
  ) {
    return "fixture_schedule";
  }
  if (/\b(power|electrical)\s*plan\b/.test(t)) return "power_plan";
  if (/\b(panel)\s*schedule\b/.test(t)) return "spec_detail";
  if (/\b(legend|keynote|abbreviation)\b/.test(t)) return "legend";
  if (/\b(spec(ification)?s?|detail|section|elevation|riser)\b/.test(t)) {
    return "spec_detail";
  }
  if (/\b(floor\s*plan|architectural|a[-\s]?[0-9])\b/.test(t)) {
    return "architectural_floor_plan";
  }
  return null;
}

export function inferFloorFromTitle(title: string): number | null {
  const t = title.toLowerCase();
  if (/\b(basement|cellar|lower\s*level)\b/.test(t)) return 0;
  if (/\b(third|3rd|level\s*3|floor\s*3|3\s*(st|nd|rd)?\s*floor)\b/.test(t)) {
    return 3;
  }
  if (/\b(second|2nd|level\s*2|floor\s*2|2\s*(st|nd|rd)?\s*floor)\b/.test(t)) {
    return 2;
  }
  if (
    /\b(first|1st|level\s*1|floor\s*1|main\s*level|ground|1\s*(st|nd|rd)?\s*floor)\b/.test(
      t,
    )
  ) {
    return 1;
  }
  return null;
}

export function selectRoomSourcePages(
  pages: {
    page: number;
    sheetType: RoomScanSheetType;
    floorLevel: number | null;
  }[],
): { selectedPages: number[]; skippedNotes: string[] } {
  const skippedNotes: string[] = [];
  const roomSources = pages.filter((p) => isRoomCountSource(p.sheetType));

  for (const p of pages) {
    if (!isRoomCountSource(p.sheetType)) {
      skippedNotes.push(
        `Page ${p.page}: skipped (${p.sheetType} — not a room-count sheet)`,
      );
    }
  }

  const byFloor = new Map<number | "unknown", typeof roomSources>();
  for (const p of roomSources) {
    const key: number | "unknown" =
      p.floorLevel != null && Number.isFinite(p.floorLevel)
        ? Math.round(p.floorLevel)
        : "unknown";
    const group = byFloor.get(key) ?? [];
    group.push(p);
    byFloor.set(key, group);
  }

  const selectedPages: number[] = [];
  for (const [floor, group] of byFloor) {
    const sorted = [...group].sort(
      (a, b) =>
        ROOM_SOURCE_PRIORITY[b.sheetType] - ROOM_SOURCE_PRIORITY[a.sheetType] ||
        a.page - b.page,
    );
    const winner = sorted[0]!;
    selectedPages.push(winner.page);
    for (const p of sorted.slice(1)) {
      skippedNotes.push(
        `Page ${p.page}: skipped (floor ${floor}: lower priority than page ${winner.page}, ${p.sheetType} vs ${winner.sheetType})`,
      );
    }
  }

  selectedPages.sort((a, b) => a - b);
  return { selectedPages, skippedNotes };
}
