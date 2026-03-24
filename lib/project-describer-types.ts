/**
 * Structured analysis from /api/tools/analyze-project-description (Claude JSON).
 */

export type ProjectDescriberHintId =
  | "electrical"
  | "wifi"
  | "av"
  | "smarthome"
  | "low_voltage"
  | "all";

export type ScopeSizeEstimate = "small" | "medium" | "large" | "commercial";

export type DetectedRoomArea = {
  name: string;
  floor?: number | null;
  approximate_sq_ft?: number | null;
  approximate_width_ft?: number | null;
  approximate_length_ft?: number | null;
  room_type?: string | null;
};

export type DetectedDevice = {
  category: string;
  quantity: number;
  notes?: string | null;
  room?: string | null;
};

export type DetectedSystem = {
  name: string;
  role?: string | null;
  brand?: string | null;
};

export type ProjectDescriptionAnalysis = {
  project_types: string[];
  scope_size: ScopeSizeEstimate;
  budget_min_usd: number | null;
  budget_max_usd: number | null;
  budget_label: string | null;
  rooms: DetectedRoomArea[];
  devices: DetectedDevice[];
  systems: DetectedSystem[];
  special_requirements: string[];
  complexity: string;
  room_count_estimate: number;
  key_items_summary: string;
};

export type GeneratedProjectPackage = {
  internalWorkScope: string;
  fieldWorkOrder: string;
  clientProposal: string;
  billOfMaterials: string;
  laborEstimate: string;
};

export function safeParseAnalysis(
  text: string,
): ProjectDescriptionAnalysis | null {
  try {
    const trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    const payload = (fence ? fence[1] : trimmed).trim();
    const o = JSON.parse(payload) as Record<string, unknown>;
    return normalizeAnalysis(o);
  } catch {
    return null;
  }
}

function normalizeAnalysis(o: Record<string, unknown>): ProjectDescriptionAnalysis | null {
  const project_types = Array.isArray(o.project_types)
    ? o.project_types.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const scope_raw = String(o.scope_size ?? "medium").toLowerCase();
  const scope_size: ScopeSizeEstimate = [
    "small",
    "medium",
    "large",
    "commercial",
  ].includes(scope_raw)
    ? (scope_raw as ScopeSizeEstimate)
    : "medium";

  const rooms: DetectedRoomArea[] = Array.isArray(o.rooms)
    ? o.rooms.map((r) => {
        if (!r || typeof r !== "object") return null;
        const x = r as Record<string, unknown>;
        const name = String(x.name ?? x.room_name ?? "").trim();
        if (!name) return null;
        return {
          name,
          floor:
            x.floor != null ? Number(x.floor) : x.floor_level != null
              ? Number(x.floor_level)
              : null,
          approximate_sq_ft: numOrNull(x.approximate_sq_ft ?? x.sq_ft),
          approximate_width_ft: numOrNull(
            x.approximate_width_ft ?? x.width_ft,
          ),
          approximate_length_ft: numOrNull(
            x.approximate_length_ft ?? x.length_ft,
          ),
          room_type:
            x.room_type != null ? String(x.room_type) : x.type != null
              ? String(x.type)
              : null,
        };
      }).filter(Boolean) as DetectedRoomArea[]
    : [];

  const devices: DetectedDevice[] = Array.isArray(o.devices)
    ? o.devices
        .map((d) => {
          if (!d || typeof d !== "object") return null;
          const x = d as Record<string, unknown>;
          const category = String(x.category ?? x.type ?? "item").trim();
          const quantity = Math.max(
            0,
            Math.round(Number(x.quantity ?? x.count ?? 0)),
          );
          return {
            category,
            quantity: quantity || 1,
            notes: x.notes != null ? String(x.notes) : null,
            room: x.room != null ? String(x.room) : null,
          };
        })
        .filter(Boolean) as DetectedDevice[]
    : [];

  const systems: DetectedSystem[] = Array.isArray(o.systems)
    ? o.systems
        .map((s) => {
          if (!s || typeof s !== "object") return null;
          const x = s as Record<string, unknown>;
          const name = String(x.name ?? "").trim();
          if (!name) return null;
          return {
            name,
            role: x.role != null ? String(x.role) : null,
            brand: x.brand != null ? String(x.brand) : null,
          };
        })
        .filter(Boolean) as DetectedSystem[]
    : [];

  const special_requirements = Array.isArray(o.special_requirements)
    ? o.special_requirements.map((x) => String(x).trim()).filter(Boolean)
    : [];

  return {
    project_types,
    scope_size,
    budget_min_usd: numOrNull(o.budget_min_usd),
    budget_max_usd: numOrNull(o.budget_max_usd),
    budget_label: o.budget_label != null ? String(o.budget_label) : null,
    rooms,
    devices,
    systems,
    special_requirements,
    complexity: String(o.complexity ?? "moderate"),
    room_count_estimate: Math.max(
      rooms.length,
      Math.round(Number(o.room_count_estimate ?? 0)) || 0,
    ),
    key_items_summary: String(o.key_items_summary ?? "").trim(),
  };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function safeParseGeneratedPackage(
  text: string,
): GeneratedProjectPackage | null {
  try {
    const trimmed = text.trim();
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    const payload = (fence ? fence[1] : trimmed).trim();
    const o = JSON.parse(payload) as Record<string, unknown>;
    const req = [
      "internalWorkScope",
      "fieldWorkOrder",
      "clientProposal",
      "billOfMaterials",
      "laborEstimate",
    ] as const;
    const out: Partial<GeneratedProjectPackage> = {};
    for (const k of req) {
      out[k] = typeof o[k] === "string" ? (o[k] as string) : "";
    }
    return out as GeneratedProjectPackage;
  } catch {
    return null;
  }
}
