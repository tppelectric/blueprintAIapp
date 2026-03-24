/**
 * Types and mappers for AI floor-plan room scans (Wi‑Fi / AV / Smart Home tools).
 */

import type { AvRoomInput, AvRoomType } from "@/lib/av-analyzer-engine";
import type { ShRoomInput, ShRoomType } from "@/lib/smarthome-analyzer-engine";
import type {
  CeilingHeight,
  RoomTypeOption,
  RoomWallMaterial,
  WifiRoomInput,
} from "@/lib/wifi-analyzer-engine";

export type FloorPlanScanRoom = {
  room_name: string;
  room_type: string;
  width_ft: number | null;
  length_ft: number | null;
  sq_ft: number | null;
  floor: number | null;
  confidence: number;
};

export type FloorPlanScanApiResponse = {
  rooms: FloorPlanScanRoom[];
  equipment_placement_suggestions: string[];
  scan_notes: string;
};

export function extractFloorPlanScanPayload(text: string): {
  rooms: unknown[];
  equipment_placement_suggestions: string[];
  scan_notes: string;
} {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = (fence ? fence[1] : trimmed).trim();
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  const rooms = Array.isArray(parsed.rooms) ? parsed.rooms : [];
  const sug = parsed.equipment_placement_suggestions;
  const suggestions = Array.isArray(sug)
    ? sug.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const scan_notes =
    typeof parsed.scan_notes === "string" ? parsed.scan_notes.trim() : "";
  return { rooms, equipment_placement_suggestions: suggestions, scan_notes };
}

const WIFI_TYPES = new Set<string>([
  "living_room",
  "bedroom",
  "kitchen",
  "bathroom",
  "garage",
  "dining_room",
  "hallway",
  "laundry",
  "outdoor",
  "patio",
  "basement",
  "office",
  "utility",
  "other",
]);

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function floorOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 1;
  return n;
}

export function normalizeFloorPlanScanRoom(raw: unknown): FloorPlanScanRoom | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const room_name = String(o.room_name ?? "").trim();
  if (!room_name) return null;
  let rt = String(o.room_type ?? "other").toLowerCase().trim();
  if (!WIFI_TYPES.has(rt)) rt = "other";
  const confidence = Number(o.confidence);
  const c =
    Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
      ? confidence
      : 0.75;
  return {
    room_name,
    room_type: rt,
    width_ft: numOrNull(o.approximate_width_ft ?? o.width_ft),
    length_ft: numOrNull(o.approximate_length_ft ?? o.length_ft),
    sq_ft: numOrNull(o.approximate_sq_ft ?? o.sq_ft),
    floor: floorOrNull(o.floor ?? o.floor_level),
    confidence: c,
  };
}

export function normalizeFloorPlanScanResponse(
  roomsRaw: unknown[],
): FloorPlanScanRoom[] {
  const out: FloorPlanScanRoom[] = [];
  for (const r of roomsRaw) {
    const n = normalizeFloorPlanScanRoom(r);
    if (n) out.push(n);
  }
  return out;
}

function deriveLengthWidth(r: FloorPlanScanRoom): { lengthFt: number; widthFt: number } {
  let L = r.length_ft ?? 0;
  let W = r.width_ft ?? 0;
  const sq = r.sq_ft;
  if (sq != null && sq > 0 && L <= 0 && W <= 0) {
    const s = Math.sqrt(sq);
    return {
      lengthFt: Math.round(s * 10) / 10,
      widthFt: Math.round(s * 10) / 10,
    };
  }
  if (L > 0 && W <= 0 && sq != null && sq > 0) {
    W = Math.max(1, Math.round((sq / L) * 10) / 10);
  } else if (W > 0 && L <= 0 && sq != null && sq > 0) {
    L = Math.max(1, Math.round((sq / W) * 10) / 10);
  }
  if (L <= 0) L = 12;
  if (W <= 0) W = 12;
  return { lengthFt: L, widthFt: W };
}

function clampWifiFloor(f: number | null): 1 | 2 | 3 | 4 {
  if (f == null || f < 1) return 1;
  if (f >= 4) return 4;
  return f as 1 | 2 | 3 | 4;
}

function mapWifiRoomType(rt: string): RoomTypeOption {
  const t = rt.toLowerCase();
  if (t === "dining_room") return "living_room";
  if (t === "laundry") return "other";
  if (t === "utility") return "garage";
  const allowed: RoomTypeOption[] = [
    "living_room",
    "bedroom",
    "office",
    "kitchen",
    "bathroom",
    "hallway",
    "garage",
    "basement",
    "patio",
    "outdoor",
    "other",
  ];
  return (allowed.includes(t as RoomTypeOption) ? t : "other") as RoomTypeOption;
}

function wifiOutdoor(rt: string, name: string): boolean {
  const n = name.toLowerCase();
  if (rt === "outdoor") return true;
  if (/patio|deck|porch|pool|yard|exterior/i.test(n)) return true;
  return false;
}

function estimateWifiDevices(rt: string): number {
  switch (rt) {
    case "kitchen":
      return 18;
    case "living_room":
      return 14;
    case "office":
      return 10;
    case "bedroom":
      return 8;
    case "bathroom":
      return 4;
    case "garage":
      return 6;
    case "basement":
      return 10;
    default:
      return 8;
  }
}

export function floorPlanScanToWifiRooms(
  scanned: FloorPlanScanRoom[],
  newId: () => string,
): WifiRoomInput[] {
  return scanned.map((r) => {
    const { lengthFt, widthFt } = deriveLengthWidth(r);
    const outdoor = wifiOutdoor(r.room_type, r.room_name);
    let rt = mapWifiRoomType(r.room_type);
    if (outdoor) {
      rt =
        r.room_type === "patio" || /patio|deck|porch/i.test(r.room_name)
          ? "patio"
          : "outdoor";
    }
    return {
      id: newId(),
      name: r.room_name,
      floor: clampWifiFloor(r.floor),
      lengthFt,
      widthFt,
      roomType: rt,
      wallMaterial: "drywall" as RoomWallMaterial,
      outdoor,
      ceilingHeight: "9" as CeilingHeight,
      expectedDevices: estimateWifiDevices(r.room_type),
    };
  });
}

function mapAvRoomType(rt: string, name: string): AvRoomType {
  const t = rt.toLowerCase();
  const n = name.toLowerCase();
  if (t === "bedroom" && /primary|master/i.test(n)) return "master_bedroom";
  const map: Record<string, AvRoomType> = {
    living_room: "living_room",
    bedroom: "bedroom",
    master_bedroom: "master_bedroom",
    kitchen: "kitchen",
    dining_room: "dining_room",
    bathroom: "other",
    garage: "other",
    hallway: "other",
    laundry: "other",
    outdoor: "outdoor",
    patio: "patio",
    basement: "basement",
    office: "office",
    utility: "other",
    other: "other",
  };
  return map[t] ?? "other";
}

export function floorPlanScanToAvRooms(
  scanned: FloorPlanScanRoom[],
  newId: () => string,
): AvRoomInput[] {
  return scanned.map((r) => {
    const { lengthFt, widthFt } = deriveLengthWidth(r);
    const rt = mapAvRoomType(r.room_type, r.room_name);
    const outdoor =
      r.room_type === "outdoor" ||
      r.room_type === "patio" ||
      /patio|deck|pool|porch/i.test(r.room_name.toLowerCase());
    const roomType: AvRoomType = outdoor
      ? r.room_type === "patio" || /patio|deck/i.test(r.room_name.toLowerCase())
        ? "patio"
        : "outdoor"
      : rt;
    return {
      id: newId(),
      name: r.room_name,
      floor: clampWifiFloor(r.floor),
      lengthFt,
      widthFt,
      roomType,
      primaryUse: outdoor ? "outdoor_entertainment_use" : "multi_purpose",
      outdoorSpace: outdoor,
      outdoorSpeakerType: "rock_landscape",
      ceilingType: "standard_flat",
      ceilingHeight: "9",
      acousticTreatment: "some_soft",
      seats: Math.min(12, Math.max(2, Math.round(Math.sqrt(lengthFt * widthFt) / 2))),
      displayNeeded: !outdoor && !["bathroom", "hallway", "utility"].includes(r.room_type),
      displayPref: "no_pref",
      ambientLight: outdoor ? "outdoor" : "moderate",
    };
  });
}

function mapShRoomType(rt: string): ShRoomType {
  const t = rt.toLowerCase();
  const allowed: ShRoomType[] = [
    "living_room",
    "bedroom",
    "kitchen",
    "office",
    "hallway",
    "basement",
    "garage",
    "outdoor",
    "conference",
    "lobby",
    "other",
  ];
  if (t === "bathroom" || t === "laundry" || t === "utility") return "other";
  return (allowed.includes(t as ShRoomType) ? t : "other") as ShRoomType;
}

function shDefaultsForType(rt: ShRoomType): Partial<ShRoomInput> {
  switch (rt) {
    case "kitchen":
      return { switchCount: 4, lightingControl: true, thermostat: false };
    case "living_room":
      return { switchCount: 3, avControl: true, voiceControl: true };
    case "bedroom":
      return { switchCount: 2, avControl: false };
    case "office":
      return {
        switchCount: 2,
        cameras: true,
        cameraIndoor: 1,
        securitySensors: true,
        motionCount: 1,
      };
    default:
      return { switchCount: 2 };
  }
}

export function floorPlanScanToSmartHomeRooms(
  scanned: FloorPlanScanRoom[],
  newId: () => string,
): ShRoomInput[] {
  return scanned.map((r) => {
    const rt = mapShRoomType(r.room_type);
    const base: ShRoomInput = {
      id: newId(),
      name: r.room_name,
      roomType: rt,
      lightingControl: true,
      switchCount: 3,
      motorizedShades: rt === "living_room" || rt === "bedroom",
      shadeCount: rt === "living_room" || rt === "bedroom" ? 2 : 0,
      thermostat: rt === "living_room" || rt === "bedroom" || rt === "office",
      avControl: rt === "living_room" || rt === "office",
      doorLock: rt === "bedroom" || rt === "office",
      securitySensors: rt === "office" || rt === "garage",
      motionCount: rt === "office" ? 1 : 0,
      doorWindowSensorCount: rt === "office" ? 1 : 0,
      cameras: rt === "office",
      cameraIndoor: rt === "office" ? 1 : 0,
      cameraOutdoor: 0,
      voiceControl: true,
      touchscreenKeypad: rt === "living_room",
      occupancySensor: false,
    };
    return { ...base, ...shDefaultsForType(rt) };
  });
}
