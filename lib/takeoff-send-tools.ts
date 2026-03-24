import type { ElectricalItemRow } from "@/lib/electrical-item-types";
import type { DetectedRoomRow } from "@/lib/detected-room-types";
import type { ResidentialInputs } from "@/lib/load-calc-engine";
import type { FloorPlanScanRoom } from "@/lib/tool-floor-plan-scan";
import {
  floorPlanScanToAvRooms,
  floorPlanScanToElectricalRooms,
  floorPlanScanToSmartHomeRooms,
} from "@/lib/tool-floor-plan-scan";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function detectedRoomsToFloorPlanRooms(
  rooms: DetectedRoomRow[],
): FloorPlanScanRoom[] {
  return rooms.map((r) => ({
    room_name: r.room_name,
    room_type: r.room_type || "other",
    width_ft: r.width_ft != null ? Number(r.width_ft) : null,
    length_ft: r.length_ft != null ? Number(r.length_ft) : null,
    sq_ft: r.sq_ft != null ? Number(r.sq_ft) : null,
    floor: null,
    confidence:
      r.confidence != null && Number.isFinite(Number(r.confidence))
        ? Number(r.confidence)
        : 0.85,
  }));
}

function sumSqFt(rooms: DetectedRoomRow[]): number {
  let t = 0;
  for (const r of rooms) {
    const w = r.width_ft != null ? Number(r.width_ft) : null;
    const len = r.length_ft != null ? Number(r.length_ft) : null;
    if (w != null && len != null && w > 0 && len > 0) t += w * len;
    else if (r.sq_ft != null) {
      const s = Number(r.sq_ft);
      if (Number.isFinite(s) && s > 0) t += s;
    }
  }
  return Math.round(t);
}

/** Heuristic load-calculator prefill from takeoff line items (all pages). */
export function buildLoadCalcPayloadFromTakeoffItems(
  items: ElectricalItemRow[],
  projectName: string,
  squareFootage: number,
): Partial<ResidentialInputs> {
  const blob = items
    .map((i) => `${i.description} ${i.specification ?? ""}`)
    .join(" ")
    .toLowerCase();
  const appliances: ResidentialInputs["appliances"] = {
    range: {
      enabled: /\b(range|cooktop|oven|stove)\b/i.test(blob),
      watts: 8000,
    },
    dryer: { enabled: /\bdryer\b/i.test(blob), watts: 5000 },
    waterHeater: {
      enabled: /\bwater\s*heater|\bwh\b|tankless/i.test(blob),
      watts: 4500,
    },
    dishwasher: { enabled: /\bdishwasher\b/i.test(blob), watts: 1200 },
    refrigerator: { enabled: /\b(refrigerator|fridge)\b/i.test(blob), watts: 150 },
    microwave: { enabled: /\bmicrowave\b/i.test(blob), watts: 1500 },
    ac: {
      enabled: /\b(a\/c|ac unit|air conditioning|heat pump|hvac)\b/i.test(blob),
      tons: 3,
    },
    electricHeat: { enabled: /\b(baseboard|electric heat)\b/i.test(blob), kw: 10 },
    evL1: { enabled: /\bev\b.*\b(level\s*1|120v)\b/i.test(blob), watts: 1440 },
    evL2: {
      enabled: /\b(ev charger|car charger|level\s*2|240v.*ev)\b/i.test(blob),
      watts: 7200,
    },
    hotTub: { enabled: /\b(hot tub|spa)\b/i.test(blob), watts: 5000 },
    poolPump: { enabled: /\bpool\s*pump\b/i.test(blob), watts: 2000 },
    generator: { enabled: /\bgenerator\b/i.test(blob), kw: 12 },
  };
  return {
    projectName,
    squareFootage: Math.max(500, squareFootage || 2000),
    buildingType: "single_family",
    appliances,
  };
}

export function pushTakeoffToLoadCalculator(
  items: ElectricalItemRow[],
  rooms: DetectedRoomRow[],
  projectName: string,
): void {
  const sq = sumSqFt(rooms);
  const payload = buildLoadCalcPayloadFromTakeoffItems(
    items,
    projectName,
    sq || 2000,
  );
  sessionStorage.setItem(
    "blueprint-load-calc-from-electrical",
    JSON.stringify(payload),
  );
}

export function pushTakeoffToElectricalAnalyzer(
  items: ElectricalItemRow[],
  rooms: DetectedRoomRow[],
  projectName: string,
): void {
  const fp = detectedRoomsToFloorPlanRooms(rooms);
  const elecRooms = floorPlanScanToElectricalRooms(fp, newId);
  const totalSq = sumSqFt(rooms);
  const floors = new Set(
    rooms.map((r) => {
      const m = /\bfloor\s*(\d+)|(\d+)(st|nd|rd|th)\s*floor/i.exec(
        `${r.room_name} ${r.room_type}`,
      );
      if (m) return parseInt(m[1] ?? m[2] ?? "1", 10) || 1;
      return 1;
    }),
  ).size;
  sessionStorage.setItem(
    "blueprint-room-scan-electrical",
    JSON.stringify({
      rooms: elecRooms,
      projectName,
      totalSqFt: totalSq || undefined,
      numFloors: Math.max(1, floors),
      takeoffHint: `Imported ${items.length} takeoff line item(s). Refine dedicated loads per room.`,
    }),
  );
}

export function pushTakeoffToNecChecker(
  items: ElectricalItemRow[],
  projectName: string,
): void {
  const cats = items.reduce(
    (acc, i) => {
      acc[i.category] = (acc[i.category] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const parts = Object.entries(cats)
    .map(([k, n]) => `${k}: ${n}`)
    .join("; ");
  const q = `Blueprint takeoff for "${projectName}". Item categories: ${parts || "none"}. Ask: What NEC 2023 items should we verify for receptacle spacing, GFCI/AFCI, bathroom/kitchen circuits, and load calculations for this scope?`;
  sessionStorage.setItem(
    "blueprint-nec-checker-prefill",
    JSON.stringify({ question: q }),
  );
}

export function takeoffHasAvSignals(items: ElectricalItemRow[]): boolean {
  const blob = items
    .map((i) => `${i.description} ${i.specification ?? ""}`)
    .join(" ")
    .toLowerCase();
  return /\b(tv|television|hdmi|speaker|surround|atmos|avr|display|projector)\b/i.test(
    blob,
  );
}

export function takeoffHasSmartHomeSignals(items: ElectricalItemRow[]): boolean {
  const blob = items
    .map((i) => `${i.description} ${i.specification ?? ""}`)
    .join(" ")
    .toLowerCase();
  return /\b(thermostat|hvac control|alarm|security|shade|drape|motorized|smart\s*switch|lutron|control4)\b/i.test(
    blob,
  );
}

export function pushTakeoffToAvAnalyzer(
  rooms: DetectedRoomRow[],
  projectName: string,
): void {
  const fp = detectedRoomsToFloorPlanRooms(rooms);
  const avRooms = floorPlanScanToAvRooms(fp, newId);
  const totalSq = sumSqFt(rooms);
  sessionStorage.setItem(
    "blueprint-room-scan-av",
    JSON.stringify({
      rooms: avRooms,
      projectName,
      totalSqFt: totalSq || undefined,
      floors: Math.max(1, Math.min(6, rooms.length > 8 ? 2 : 1)),
    }),
  );
}

export function pushTakeoffToSmartHomeAnalyzer(
  rooms: DetectedRoomRow[],
  projectName: string,
): void {
  const fp = detectedRoomsToFloorPlanRooms(rooms);
  const shRooms = floorPlanScanToSmartHomeRooms(fp, newId);
  const totalSq = sumSqFt(rooms);
  sessionStorage.setItem(
    "blueprint-room-scan-smarthome",
    JSON.stringify({
      rooms: shRooms,
      projectName,
      totalSqFt: totalSq || undefined,
      floors: Math.max(1, Math.min(6, rooms.length > 8 ? 2 : 1)),
    }),
  );
}
