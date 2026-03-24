import type { AvRoomInput, AvRoomType } from "@/lib/av-analyzer-engine";
import type { ShRoomInput, ShRoomType } from "@/lib/smarthome-analyzer-engine";
import type {
  CeilingHeight,
  RoomTypeOption,
  RoomWallMaterial,
  WifiRoomInput,
} from "@/lib/wifi-analyzer-engine";
import type {
  DetectedDevice,
  ProjectDescriptionAnalysis,
} from "@/lib/project-describer-types";

export const STORAGE_WIFI = "blueprint-project-describer-wifi";
export const STORAGE_AV = "blueprint-project-describer-av";
export const STORAGE_SMARTHOME = "blueprint-project-describer-smarthome";
export const STORAGE_ROOM_SCAN_WIFI = "blueprint-room-scan-wifi";
export const STORAGE_ROOM_SCAN_AV = "blueprint-room-scan-av";
export const STORAGE_ROOM_SCAN_SMARTHOME = "blueprint-room-scan-smarthome";

function mapShRoomType(rt: string | null | undefined, name: string): ShRoomType {
  const t = (rt ?? "").toLowerCase();
  const n = name.toLowerCase();
  if (/office|study/i.test(n)) return "office";
  if (/kitchen/i.test(n)) return "kitchen";
  if (/bath/i.test(n)) return "other";
  if (/bed/i.test(n)) return "bedroom";
  if (/basement/i.test(n)) return "basement";
  if (/garage/i.test(n)) return "garage";
  if (/patio|deck|outdoor/i.test(n)) return "other";
  const map: Record<string, ShRoomType> = {
    living_room: "living_room",
    bedroom: "bedroom",
    kitchen: "kitchen",
    bathroom: "other",
    garage: "garage",
    dining_room: "living_room",
    hallway: "hallway",
    laundry: "other",
    outdoor: "outdoor",
    patio: "outdoor",
    basement: "basement",
    office: "office",
    utility: "other",
    other: "other",
  };
  return map[t] ?? "other";
}

function mapAvRoomType(rt: string | null | undefined, name: string): AvRoomType {
  const t = (rt ?? "").toLowerCase();
  const n = name.toLowerCase();
  if (/primary|master/i.test(n) && /bed/i.test(n)) return "master_bedroom";
  if (/theater|media|cinema/i.test(n)) return "home_theater";
  if (/patio|deck/i.test(n)) return "patio";
  if (/outdoor|pool|yard/i.test(n)) return "outdoor";
  if (/basement/i.test(n)) return "basement";
  const map: Record<string, AvRoomType> = {
    living_room: "living_room",
    bedroom: "bedroom",
    kitchen: "kitchen",
    dining_room: "dining_room",
    bathroom: "other",
    garage: "other",
    hallway: "other",
    basement: "basement",
    office: "office",
    patio: "patio",
    outdoor: "outdoor",
    other: "other",
  };
  return map[t] ?? "other";
}

function mapWifiRoomType(rt: string | null | undefined): RoomTypeOption {
  const t = (rt ?? "other").toLowerCase();
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
  if (t === "dining_room") return "living_room";
  return (allowed.includes(t as RoomTypeOption) ? t : "other") as RoomTypeOption;
}

function deriveDims(
  sq: number | null | undefined,
  w: number | null | undefined,
  l: number | null | undefined,
) {
  if (w != null && l != null && w > 0 && l > 0) return { lengthFt: l, widthFt: w };
  if (sq != null && sq > 0) {
    const s = Math.sqrt(sq);
    return { lengthFt: Math.round(s * 10) / 10, widthFt: Math.round(s * 10) / 10 };
  }
  return { lengthFt: 14, widthFt: 12 };
}

function clampWifiFloor(f: number | null | undefined): 1 | 2 | 3 | 4 {
  if (f == null || !Number.isFinite(f)) return 1;
  const n = Math.round(f);
  if (n < 1) return 1;
  if (n > 4) return 4;
  return n as 1 | 2 | 3 | 4;
}

function aggregateDevicesForRoom(
  roomName: string,
  devices: DetectedDevice[],
): {
  cameras: number;
  dimmers: number;
  speakers: number;
} {
  const n = roomName.toLowerCase();
  let cameras = 0;
  let dimmers = 0;
  let speakers = 0;
  for (const d of devices) {
    const cat = d.category.toLowerCase();
    const r = (d.room ?? "").toLowerCase();
    if (r && !n.includes(r) && !r.includes(n.split(" ")[0] ?? "")) continue;
    if (/camera|cctv/i.test(cat)) cameras += d.quantity;
    if (/dimmer|light|lutron|switch/i.test(cat)) dimmers += d.quantity;
    if (/speaker|audio|sonos/i.test(cat)) speakers += d.quantity;
  }
  return { cameras, dimmers, speakers };
}

export function analysisToWifiRooms(
  a: ProjectDescriptionAnalysis,
  newId: () => string,
): WifiRoomInput[] {
  if (!a.rooms.length) {
    return [
      {
        id: newId(),
        name: "Whole project",
        floor: 1,
        lengthFt: 20,
        widthFt: 20,
        roomType: "other",
        wallMaterial: "drywall" as RoomWallMaterial,
        outdoor: false,
        ceilingHeight: "9" as CeilingHeight,
        expectedDevices: 12,
      },
    ];
  }
  return a.rooms.map((r) => {
    const { lengthFt, widthFt } = deriveDims(
      r.approximate_sq_ft,
      r.approximate_width_ft,
      r.approximate_length_ft,
    );
    const rt = mapWifiRoomType(r.room_type);
    const outdoor = /patio|deck|outdoor|pool|yard/i.test(r.name);
    const dev = aggregateDevicesForRoom(r.name, a.devices);
    const base = outdoor ? 4 : rt === "kitchen" ? 18 : rt === "living_room" ? 14 : 8;
    return {
      id: newId(),
      name: r.name,
      floor: clampWifiFloor(r.floor),
      lengthFt,
      widthFt,
      roomType: outdoor ? (rt === "patio" ? "patio" : "outdoor") : rt,
      wallMaterial: "drywall" as RoomWallMaterial,
      outdoor,
      ceilingHeight: "9" as CeilingHeight,
      expectedDevices: Math.max(base, dev.cameras * 2 + dev.speakers + 4),
    };
  });
}

export function analysisToAvRooms(
  a: ProjectDescriptionAnalysis,
  newId: () => string,
): AvRoomInput[] {
  if (!a.rooms.length) {
    return [
      {
        id: newId(),
        name: "Main area",
        floor: 1,
        lengthFt: 18,
        widthFt: 16,
        roomType: "living_room",
        primaryUse: "multi_purpose",
        outdoorSpace: false,
        outdoorSpeakerType: "rock_landscape",
        ceilingType: "standard_flat",
        ceilingHeight: "9",
        acousticTreatment: "some_soft",
        seats: 4,
        displayNeeded: true,
        displayPref: "no_pref",
        ambientLight: "moderate",
      },
    ];
  }
  return a.rooms.map((r) => {
    const { lengthFt, widthFt } = deriveDims(
      r.approximate_sq_ft,
      r.approximate_width_ft,
      r.approximate_length_ft,
    );
    const roomType = mapAvRoomType(r.room_type, r.name);
    const outdoor =
      roomType === "patio" ||
      roomType === "outdoor" ||
      /patio|deck|pool/i.test(r.name);
    const theater =
      /theater|media|cinema/i.test(r.name) || roomType === "home_theater";
    return {
      id: newId(),
      name: r.name,
      floor: Math.max(1, Math.round(r.floor ?? 1)),
      lengthFt,
      widthFt,
      roomType: outdoor ? "patio" : roomType,
      primaryUse: theater ? "home_theater_use" : "multi_purpose",
      outdoorSpace: outdoor,
      outdoorSpeakerType: "rock_landscape" as const,
      ceilingType: "standard_flat" as const,
      ceilingHeight: "9" as const,
      acousticTreatment: theater ? "treated" : ("some_soft" as const),
      seats: theater ? 8 : 4,
      displayNeeded: theater || roomType === "living_room",
      displayPref: "no_pref" as const,
      ambientLight: outdoor ? ("outdoor" as const) : ("moderate" as const),
    };
  });
}

export function analysisToSmartHomeRooms(
  a: ProjectDescriptionAnalysis,
  newId: () => string,
): ShRoomInput[] {
  const totalCams = a.devices
    .filter((d) => /camera|cctv/i.test(d.category))
    .reduce((s, d) => s + d.quantity, 0);
  const totalDimmers = a.devices
    .filter((d) => /dimmer|light|lutron/i.test(d.category))
    .reduce((s, d) => s + d.quantity, 0);

  if (!a.rooms.length) {
    return [
      {
        id: newId(),
        name: "Residence",
        roomType: "living_room",
        lightingControl: true,
        switchCount: Math.max(3, Math.round(totalDimmers / 4) || 3),
        motorizedShades: false,
        shadeCount: 0,
        thermostat: true,
        avControl: true,
        doorLock: false,
        securitySensors: totalCams > 0,
        motionCount: Math.min(totalCams, 4),
        doorWindowSensorCount: 2,
        cameras: totalCams > 0,
        cameraIndoor: Math.max(0, totalCams - 2),
        cameraOutdoor: Math.min(2, totalCams),
        voiceControl: true,
        touchscreenKeypad: false,
        occupancySensor: false,
      },
    ];
  }

  const perRoomCams = Math.max(0, Math.ceil(totalCams / a.rooms.length));

  return a.rooms.map((r) => {
    const rt = mapShRoomType(r.room_type, r.name);
    const { cameras, dimmers, speakers } = aggregateDevicesForRoom(r.name, a.devices);
    const cam = cameras || (perRoomCams > 0 ? perRoomCams : 0);
    const sw = dimmers || (rt === "kitchen" ? 4 : rt === "living_room" ? 4 : 2);
    return {
      id: newId(),
      name: r.name,
      roomType: rt,
      lightingControl: true,
      switchCount: Math.max(1, sw),
      motorizedShades: /shade/i.test(a.key_items_summary),
      shadeCount: 0,
      thermostat: rt !== "garage" && !/bath|powder/i.test(r.name),
      avControl: speakers > 0 || rt === "living_room" || rt === "office",
      doorLock: /lock|access/i.test(a.key_items_summary),
      securitySensors: cam > 0,
      motionCount: cam > 0 ? 1 : 0,
      doorWindowSensorCount: cam > 0 ? 1 : 0,
      cameras: cam > 0,
      cameraIndoor: cam,
      cameraOutdoor: /outdoor|patio/i.test(r.name) ? cam : 0,
      voiceControl: a.systems.some((s) => /control4|crestron|alexa|google/i.test(s.name)),
      touchscreenKeypad: false,
      occupancySensor: false,
    };
  });
}

export function totalSqFtFromAnalysis(a: ProjectDescriptionAnalysis): number {
  const sum = a.rooms.reduce(
    (s, r) => s + (r.approximate_sq_ft ?? 0),
    0,
  );
  if (sum > 0) return Math.round(sum);
  if (a.scope_size === "large") return 4500;
  if (a.scope_size === "commercial") return 12000;
  if (a.scope_size === "small") return 1800;
  return 2800;
}

export function floorsFromAnalysis(a: ProjectDescriptionAnalysis): number {
  const fs = a.rooms.map((r) => r.floor).filter((f): f is number => f != null && f > 0);
  if (!fs.length) return a.scope_size === "commercial" ? 2 : 2;
  return Math.min(4, Math.max(1, Math.round(Math.max(...fs))));
}
