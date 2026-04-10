/** Shared Claude blueprint JSON parsing for analyze-page and analyze-target routes. */

export type IncomingItem = {
  category?: string;
  description?: string;
  specification?: string;
  quantity?: number;
  unit?: string;
  confidence?: number;
  raw_note?: string | null;
  which_room?: string | null;
  location_nx?: number | null;
  location_ny?: number | null;
};

export const ANALYSIS_CATEGORIES = new Set([
  "fixture",
  "panel",
  "wiring",
  "plan_note",
]);

const UNITS = new Set(["EA", "LF", "LOT", "NOTE"]);

const ROOM_TYPES = new Set([
  "living_room",
  "bedroom",
  "kitchen",
  "bathroom",
  "garage",
  "dining_room",
  "hallway",
  "laundry",
  "outdoor",
  "basement",
  "office",
  "utility",
  "other",
]);

export function extractAnalyzePayload(text: string): {
  electrical_items: unknown[];
  rooms: unknown[];
} {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = (fence ? fence[1] : trimmed).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    console.error("[extractAnalyzePayload] JSON.parse failed. Raw text:", text.slice(0, 300));
    return { electrical_items: [], rooms: [] };
  }
  if (Array.isArray(parsed)) {
    return { electrical_items: parsed, rooms: [] };
  }
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    const ei = o.electrical_items;
    const r = o.rooms;
    return {
      electrical_items: Array.isArray(ei) ? ei : [],
      rooms: Array.isArray(r) ? r : [],
    };
  }
  throw new Error("Claude did not return a JSON object or array.");
}

/** Room-only scan: JSON object with "rooms" array and optional "floor_count". */
export function extractRoomScanPayload(text: string): {
  rooms: unknown[];
  floor_count: number;
} {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = (fence ? fence[1] : trimmed).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    console.error("[extractRoomScanPayload] JSON.parse failed. Raw text:", text.slice(0, 300));
    return { rooms: [], floor_count: 1 };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Claude did not return a JSON object for room scan.");
  }
  const o = parsed as Record<string, unknown>;
  const rooms = Array.isArray(o.rooms) ? o.rooms : [];
  const fc = Number(o.floor_count);
  const floor_count =
    Number.isFinite(fc) && fc >= 1 && fc <= 99 ? Math.round(fc) : 1;
  return { rooms, floor_count };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function optionalNormCoord(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return clamp01(n);
}

export function normalizeAnalysisItem(raw: IncomingItem): {
  category: string;
  description: string;
  specification: string;
  quantity: number;
  unit: string;
  confidence: number;
  raw_note: string | null;
  which_room: string;
  location_nx: number | null;
  location_ny: number | null;
} | null {
  const cat = String(raw.category ?? "").toLowerCase().trim();
  if (!ANALYSIS_CATEGORIES.has(cat)) return null;
  const description = String(raw.description ?? "").trim();
  if (!description) return null;
  const confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence) || confidence < 0.5 || confidence > 1) {
    return null;
  }
  let unit = String(raw.unit ?? "EA").toUpperCase().trim();
  if (!UNITS.has(unit)) unit = "EA";
  const quantity = Number(raw.quantity);
  const q = Number.isFinite(quantity) && quantity >= 0 ? quantity : 1;
  let which = String(raw.which_room ?? "").trim();
  if (!which) which = "UNASSIGNED";
  if (which.toUpperCase() === "UNASSIGNED" || which.toUpperCase() === "N/A") {
    which = "UNASSIGNED";
  }
  const nx = optionalNormCoord(raw.location_nx);
  const ny = optionalNormCoord(raw.location_ny);
  return {
    category: cat,
    description,
    specification: String(raw.specification ?? "").trim(),
    quantity: q,
    unit,
    confidence,
    raw_note:
      raw.raw_note === null || raw.raw_note === undefined
        ? null
        : String(raw.raw_note),
    which_room: which,
    location_nx: nx,
    location_ny: ny,
  };
}

export type IncomingRoom = {
  room_name?: string;
  room_type?: string;
  approximate_width_ft?: number | null;
  approximate_length_ft?: number | null;
  approximate_sq_ft?: number | null;
  confidence?: number;
};

export function normalizeAnalysisRoom(raw: IncomingRoom): {
  room_name: string;
  room_type: string;
  width_ft: number | null;
  length_ft: number | null;
  sq_ft: number | null;
  confidence: number;
} | null {
  const room_name = String(raw.room_name ?? "").trim();
  if (!room_name) return null;
  let rt = String(raw.room_type ?? "other").toLowerCase().trim();
  if (!ROOM_TYPES.has(rt)) rt = "other";
  const confidence = Number(raw.confidence);
  const c =
    Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
      ? confidence
      : 0.75;
  const numOrNull = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return {
    room_name,
    room_type: rt,
    width_ft: numOrNull(raw.approximate_width_ft),
    length_ft: numOrNull(raw.approximate_length_ft),
    sq_ft: numOrNull(raw.approximate_sq_ft),
    confidence: c,
  };
}
