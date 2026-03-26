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

export function sliceBalancedJsonObject(body: string, start: number): string | null {
  if (start < 0 || start >= body.length || body[start] !== "{") return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i]!;
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\" && inStr) {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Pull a single JSON object from model output: markdown fences, preamble, or trailing text.
 * Tries several likely `{` positions (first brace, or object that starts with projectTypes).
 */
export function extractJsonObjectFromModelText(text: string): string | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence ? fence[1] : trimmed).trim();

  const startCandidates: number[] = [];
  const firstBrace = body.indexOf("{");
  if (firstBrace !== -1) startCandidates.push(firstBrace);
  const pt = body.search(/\{\s*"projectTypes"\s*:/);
  if (pt !== -1 && !startCandidates.includes(pt)) startCandidates.push(pt);
  const ptSnake = body.search(/\{\s*"project_types"\s*:/);
  if (ptSnake !== -1 && !startCandidates.includes(ptSnake)) {
    startCandidates.push(ptSnake);
  }
  // Regex fallback: first `{` that opens an object with a string key (common LLM pattern)
  const keyOpen = body.search(/\{\s*"/);
  if (keyOpen !== -1 && !startCandidates.includes(keyOpen)) {
    startCandidates.push(keyOpen);
  }

  for (const start of startCandidates.sort((a, b) => a - b)) {
    const slice = sliceBalancedJsonObject(body, start);
    if (slice) return slice;
  }
  return null;
}

export function safeParseAnalysis(
  text: string,
): ProjectDescriptionAnalysis | null {
  try {
    const extracted = extractJsonObjectFromModelText(text);
    if (!extracted) return null;
    const o = JSON.parse(extracted) as Record<string, unknown>;
    return normalizeAnalysis(o);
  } catch {
    return null;
  }
}

function normalizeAnalysis(o: Record<string, unknown>): ProjectDescriptionAnalysis | null {
  const project_types = Array.isArray(o.project_types)
    ? o.project_types.map((x) => String(x).trim()).filter(Boolean)
    : Array.isArray(o.projectTypes)
      ? o.projectTypes.map((x) => String(x).trim()).filter(Boolean)
      : [];
  const scope_raw = String(
    o.scope_size ?? o.scopeSize ?? "medium",
  ).toLowerCase();
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
          approximate_sq_ft: numOrNull(
            x.approximate_sq_ft ?? x.sqft ?? x.sq_ft,
          ),
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

  const devicesFromRooms: DetectedDevice[] = [];
  if (Array.isArray(o.rooms)) {
    for (const r of o.rooms) {
      if (!r || typeof r !== "object") continue;
      const x = r as Record<string, unknown>;
      const roomName = String(x.name ?? x.room_name ?? "").trim();
      const devList = x.devices;
      if (!Array.isArray(devList) || !roomName) continue;
      for (const d of devList) {
        const label =
          typeof d === "string"
            ? d.trim()
            : d && typeof d === "object"
              ? String(
                  (d as Record<string, unknown>).name ??
                    (d as Record<string, unknown>).label ??
                    "",
                ).trim()
              : "";
        if (!label) continue;
        const qty = Math.max(
          1,
          Math.round(
            Number(
              typeof d === "object" && d
                ? (d as Record<string, unknown>).quantity ?? 1
                : 1,
            ),
          ) || 1,
        );
        devicesFromRooms.push({
          category: label.split(/\s+/)[0] || "device",
          quantity: qty,
          notes: label,
          room: roomName,
        });
      }
    }
  }

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

  const devicesMerged: DetectedDevice[] = [...devices, ...devicesFromRooms];

  let systems: DetectedSystem[] = Array.isArray(o.systems)
    ? o.systems.every((s) => typeof s === "string")
      ? (o.systems as string[])
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => ({
            name,
            role: null as string | null,
            brand: null as string | null,
          }))
      : (o.systems
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
          .filter(Boolean) as DetectedSystem[])
    : [];

  const brands = Array.isArray(o.brands)
    ? o.brands.map((x) => String(x).trim()).filter(Boolean)
    : [];
  for (const b of brands) {
    systems.push({ name: b, role: "brand", brand: b });
  }

  const special_requirements = Array.isArray(o.special_requirements)
    ? o.special_requirements.map((x) => String(x).trim()).filter(Boolean)
    : [];

  const budgetRangeStr =
    o.budgetRange != null ? String(o.budgetRange).trim() : "";
  const budget_label =
    o.budget_label != null
      ? String(o.budget_label).trim()
      : budgetRangeStr || null;

  const keyItems = Array.isArray(o.keyItems)
    ? o.keyItems.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const key_items_summary =
    String(o.key_items_summary ?? "").trim() ||
    (keyItems.length ? keyItems.join(". ") : "");

  const parsedBudget = parseBudgetRangeUsd(budgetRangeStr);

  return {
    project_types,
    scope_size,
    budget_min_usd: numOrNull(o.budget_min_usd) ?? parsedBudget.min,
    budget_max_usd: numOrNull(o.budget_max_usd) ?? parsedBudget.max,
    budget_label:
      budget_label ||
      (parsedBudget.min != null || parsedBudget.max != null
        ? [
            parsedBudget.min != null
              ? `$${parsedBudget.min.toLocaleString()}`
              : "",
            parsedBudget.max != null
              ? `$${parsedBudget.max.toLocaleString()}`
              : "",
          ]
            .filter(Boolean)
            .join(" – ") || null
        : null),
    rooms,
    devices: devicesMerged,
    systems,
    special_requirements,
    complexity: String(o.complexity ?? "moderate"),
    room_count_estimate: Math.max(
      rooms.length,
      Math.round(Number(o.room_count_estimate ?? 0)) || 0,
    ),
    key_items_summary,
  };
}

/** Best-effort parse e.g. "$150k-$200k" or "150000 to 200000" */
function parseBudgetRangeUsd(s: string): {
  min: number | null;
  max: number | null;
} {
  if (!s.trim()) return { min: null, max: null };
  const segments = s.split(/(?:–|-|—|to|through)/i).map((x) => x.trim());
  const pick = (frag: string): number | null => {
    const m = frag.match(/\$?\s*([\d,.]+)\s*(k|m)?/i);
    if (!m) return null;
    let n = Number(m[1]!.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    const u = (m[2] || "").toLowerCase();
    if (u === "k") n *= 1000;
    if (u === "m") n *= 1_000_000;
    return Math.round(n);
  };
  const values = segments.map(pick).filter((v): v is number => v != null);
  if (values.length === 0) return { min: null, max: null };
  if (values.length === 1) return { min: values[0]!, max: values[0]! };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
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
    const extracted = extractJsonObjectFromModelText(text);
    if (!extracted) return null;
    const o = JSON.parse(extracted) as Record<string, unknown>;
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
