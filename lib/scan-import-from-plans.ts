import type { AvRoomInput } from "@/lib/av-analyzer-engine";
import {
  createElectricalRoom,
  defaultEleLowVoltage,
  type ElectricalRoomInput,
} from "@/lib/electrical-analyzer-engine";
import type { ElectricalItemRow } from "@/lib/electrical-item-types";
import {
  projectRoomScanRowToResponse,
  type ProjectRoomScanRow,
} from "@/lib/project-room-scans";
import type { ShRoomInput } from "@/lib/smarthome-analyzer-engine";
import {
  floorPlanScanToAvRooms,
  floorPlanScanToElectricalRooms,
  floorPlanScanToSmartHomeRooms,
  floorPlanScanToWifiRooms,
} from "@/lib/tool-floor-plan-scan";
import type { StoriesCount, WifiRoomInput } from "@/lib/wifi-analyzer-engine";
import type { ResidentialApplianceKey } from "@/lib/load-calc-engine";
import { parseScanItems, type SavedScanRow } from "@/lib/saved-scan-types";

export type PlanImportTool =
  | "wifi"
  | "av"
  | "smarthome"
  | "electrical"
  | "load_calc";

export function formatPlanScanRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfThat.getTime()) / (24 * 3600 * 1000),
  );
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function roomRowToWifi(
  row: ProjectRoomScanRow,
  newId: () => string,
): { rooms: WifiRoomInput[]; totalSqFt: number; stories: StoriesCount } {
  const resp = projectRoomScanRowToResponse(row);
  const rooms = floorPlanScanToWifiRooms(resp.rooms, newId);
  let totalSqFt = 0;
  const floors = new Set<number>();
  for (const r of resp.rooms) {
    if (r.sq_ft != null && r.sq_ft > 0) totalSqFt += r.sq_ft;
    if (r.floor != null) floors.add(Math.round(r.floor));
  }
  const mx = floors.size ? Math.max(...floors) : 1;
  const stories = Math.min(4, Math.max(1, mx)) as StoriesCount;
  return { rooms, totalSqFt: Math.round(totalSqFt), stories };
}

export function roomRowToAv(
  row: ProjectRoomScanRow,
  newId: () => string,
): { rooms: AvRoomInput[]; totalSqFt: number; floors: number } {
  const resp = projectRoomScanRowToResponse(row);
  const rooms = floorPlanScanToAvRooms(resp.rooms, newId);
  let totalSqFt = 0;
  const floorSet = new Set<number>();
  for (const r of resp.rooms) {
    if (r.sq_ft != null && r.sq_ft > 0) totalSqFt += r.sq_ft;
    if (r.floor != null) floorSet.add(Math.round(r.floor));
  }
  const floors = floorSet.size ? Math.max(...floorSet) : 1;
  return { rooms, totalSqFt: Math.round(totalSqFt), floors };
}

export function roomRowToSmartHome(
  row: ProjectRoomScanRow,
  newId: () => string,
): { rooms: ShRoomInput[]; totalSqFt: number; floors: number } {
  const resp = projectRoomScanRowToResponse(row);
  const rooms = floorPlanScanToSmartHomeRooms(resp.rooms, newId);
  let totalSqFt = 0;
  const floorSet = new Set<number>();
  for (const r of resp.rooms) {
    if (r.sq_ft != null && r.sq_ft > 0) totalSqFt += r.sq_ft;
    if (r.floor != null) floorSet.add(Math.round(r.floor));
  }
  const floors = floorSet.size ? Math.max(...floorSet) : 1;
  return { rooms, totalSqFt: Math.round(totalSqFt), floors };
}

export function roomRowToElectrical(
  row: ProjectRoomScanRow,
  newId: () => string,
): { rooms: ElectricalRoomInput[]; totalSqFt: number; floors: number } {
  const resp = projectRoomScanRowToResponse(row);
  const rooms = floorPlanScanToElectricalRooms(resp.rooms, newId);
  let totalSqFt = 0;
  const floorSet = new Set<number>();
  for (const r of resp.rooms) {
    if (r.sq_ft != null && r.sq_ft > 0) totalSqFt += r.sq_ft;
    if (r.floor != null) floorSet.add(Math.round(r.floor));
  }
  const floors = floorSet.size ? Math.max(...floorSet) : 1;
  return { rooms, totalSqFt: Math.round(totalSqFt), floors };
}

function itemQty(it: ElectricalItemRow): number {
  const f = it.final_count;
  if (typeof f === "number" && f >= 0) return f;
  return Math.max(0, it.quantity ?? 0);
}

const ITEM_TEXT = (it: ElectricalItemRow) =>
  `${it.category} ${it.description}`.toLowerCase();

export function boostWifiRoomsFromElectricalItems(
  rooms: WifiRoomInput[],
  items: ElectricalItemRow[],
): WifiRoomInput[] {
  if (!rooms.length || !items.length) return rooms;
  const receptLike = items.filter((i) => {
    const t = ITEM_TEXT(i);
    return /recept|outlet|duplex|light|switch|data|cat|network|rj45|ap\b|wifi|waps/i.test(
      t,
    );
  });
  const total = receptLike.reduce((s, i) => s + itemQty(i), 0);
  const perRoom = Math.round(total / rooms.length);
  return rooms.map((r) => ({
    ...r,
    expectedDevices: Math.min(199, r.expectedDevices + perRoom),
  }));
}

export function boostAvRoomsFromElectricalItems(
  rooms: AvRoomInput[],
  items: ElectricalItemRow[],
): AvRoomInput[] {
  if (!rooms.length || !items.length) return rooms;
  const avLike = items.filter((i) => {
    const t = ITEM_TEXT(i);
    return /tv|television|display|hdmi|speaker|audio|avr|theater|soundbar|projector/i.test(
      t,
    );
  });
  const total = avLike.reduce((s, i) => s + itemQty(i), 0);
  if (total <= 0) return rooms;
  return rooms.map((r) => ({
    ...r,
    displayNeeded: r.displayNeeded || total >= rooms.length,
    seats: Math.min(24, r.seats + Math.min(6, Math.ceil(total / rooms.length))),
  }));
}

export function boostSmartHomeFromElectricalItems(
  rooms: ShRoomInput[],
  items: ElectricalItemRow[],
): ShRoomInput[] {
  if (!rooms.length || !items.length) return rooms;
  const autoLike = items.filter((i) => {
    const t = ITEM_TEXT(i);
    return /smart|sensor|thermostat|control|dimmer|occupancy|shade|camera|low.?volt/i.test(
      t,
    );
  });
  const total = autoLike.reduce((s, i) => s + itemQty(i), 0);
  if (total <= 0) return rooms;
  const per = Math.max(1, Math.ceil(total / Math.max(1, rooms.length)));
  return rooms.map((r) => ({
    ...r,
    switchCount: Math.min(48, r.switchCount + per),
    motionCount: Math.min(24, r.motionCount + Math.ceil(per / 2)),
    lightingControl: r.lightingControl || total >= rooms.length,
  }));
}

export function boostElectricalRoomsFromItems(
  rooms: ElectricalRoomInput[],
  items: ElectricalItemRow[],
): ElectricalRoomInput[] {
  if (!rooms.length || !items.length) return rooms;
  return rooms.map((r) => {
    const key = r.name.trim().toLowerCase();
    let rec15 = 0;
    let rec20 = 0;
    let recGfci = 0;
    let recessed = 0;
    for (const it of items) {
      const wr = (it.which_room || "").trim().toLowerCase();
      if (!wr || wr === "unassigned") continue;
      if (wr !== key && !key.includes(wr) && !wr.includes(key)) continue;
      const q = itemQty(it);
      const t = ITEM_TEXT(it);
      if (/gfci|gfi/.test(t)) recGfci += q;
      else if (/20a|20 amp|laundry|kitchen|dedicated/.test(t)) rec20 += q;
      else if (/recess|can light|downlight/.test(t)) recessed += q;
      else if (/recept|outlet|duplex/.test(t)) rec15 += q;
      else if (/light|fixture/.test(t)) recessed += Math.max(1, Math.ceil(q / 2));
    }
    if (!rec15 && !rec20 && !recGfci && !recessed) return r;
    return {
      ...r,
      rec15: Math.min(120, r.rec15 + rec15),
      rec20: Math.min(60, r.rec20 + rec20),
      recGfci: Math.min(40, r.recGfci + recGfci),
      recessed: Math.min(120, r.recessed + recessed),
    };
  });
}

export function electricalItemsToElectricalRooms(
  items: ElectricalItemRow[],
  newId: () => string,
): ElectricalRoomInput[] {
  if (!items.length) return [];
  const byRoom = new Map<string, ElectricalItemRow[]>();
  for (const it of items) {
    const k = (it.which_room || "").trim() || "UNASSIGNED";
    const arr = byRoom.get(k) ?? [];
    arr.push(it);
    byRoom.set(k, arr);
  }
  const out: ElectricalRoomInput[] = [];
  for (const [name, group] of byRoom) {
    let rec15 = 0;
    let rec20 = 0;
    let recGfci = 0;
    let recessed = 0;
    for (const it of group) {
      const q = itemQty(it);
      const t = ITEM_TEXT(it);
      if (/gfci|gfi/.test(t)) recGfci += q;
      else if (/20a|20 amp|laundry|kitchen|dedicated/.test(t)) rec20 += q;
      else if (/recess|can light|downlight/.test(t)) recessed += q;
      else if (/recept|outlet|duplex/.test(t)) rec15 += q;
      else if (/light|fixture/.test(t)) recessed += Math.max(1, Math.ceil(q / 2));
    }
    const label = name === "UNASSIGNED" ? "Unassigned loads" : name;
    out.push(
      createElectricalRoom(newId(), {
        name: label,
        roomType: "other",
        floor: 1,
        lengthFt: 14,
        widthFt: 12,
        rec15: Math.min(80, Math.max(4, rec15 || 4)),
        rec20: Math.min(40, rec20),
        recGfci: Math.min(40, recGfci),
        recessed: Math.min(80, recessed),
        afciRequired: "unknown",
        lowVoltage: {
          ...defaultEleLowVoltage(),
          ethernetDrops: Math.min(24, Math.ceil((rec15 + rec20) / 4)),
        },
      }),
    );
  }
  return out;
}

export function electricalItemsToLoadCalcAppliances(
  items: ElectricalItemRow[],
): Partial<Record<ResidentialApplianceKey, { enabled: boolean }>> {
  const patch: Partial<Record<ResidentialApplianceKey, { enabled: boolean }>> =
    {};
  const text = items.map(ITEM_TEXT).join(" ");
  const enable = (k: ResidentialApplianceKey) => {
    patch[k] = { enabled: true };
  };
  if (/\brange\b|cooktop|oven/.test(text)) enable("range");
  if (/dryer/.test(text)) enable("dryer");
  if (/water heater|hwh/.test(text)) enable("waterHeater");
  if (/dishwasher|dish\s/.test(text)) enable("dishwasher");
  if (/refrigerator|fridge/.test(text)) enable("refrigerator");
  if (/microwave/.test(text)) enable("microwave");
  if (/\bac\b|heat pump|air cond/.test(text)) enable("ac");
  if (/electric heat|baseboard/.test(text)) enable("electricHeat");
  if (/ev charger|evse|car charger|level 1/.test(text)) enable("evL1");
  if (/level 2|240.*ev|80.?amp.*ev/.test(text)) enable("evL2");
  if (/hot tub|spa/.test(text)) enable("hotTub");
  if (/pool pump/.test(text)) enable("poolPump");
  if (/generator|transfer switch/.test(text)) enable("generator");
  return patch;
}

export function itemsFromSavedScan(row: SavedScanRow | null): ElectricalItemRow[] {
  if (!row) return [];
  return parseScanItems(row.items_snapshot);
}
