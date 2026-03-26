/** Structured output from POST /api/tools/process-daily-log */

export type DailyLogMaterialLine = {
  item: string;
  qty: string;
  unit: string;
};

export type ProcessDailyLogResult = {
  job_name: string | null;
  work_completed: string;
  materials_used: DailyLogMaterialLine[];
  materials_needed: DailyLogMaterialLine[];
  employees_onsite: string[];
  check_in: string | null;
  check_out: string | null;
  issues_delays: string | null;
  safety_incident: boolean;
  all_breakers_on: boolean;
  equipment_used: string | null;
  equipment_left: string | null;
  next_day_plan: string | null;
  notes: string | null;
};

export function emptyProcessDailyLogResult(): ProcessDailyLogResult {
  return {
    job_name: null,
    work_completed: "",
    materials_used: [],
    materials_needed: [],
    employees_onsite: [],
    check_in: null,
    check_out: null,
    issues_delays: null,
    safety_incident: false,
    all_breakers_on: true,
    equipment_used: null,
    equipment_left: null,
    next_day_plan: null,
    notes: null,
  };
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1) return true;
  if (v === "false" || v === 0) return false;
  return fallback;
}

function asMaterialLines(v: unknown): DailyLogMaterialLine[] {
  if (!Array.isArray(v)) return [];
  const out: DailyLogMaterialLine[] = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const item = asStr(o.item).trim();
    if (!item) continue;
    out.push({
      item,
      qty: asStr(o.qty).trim() || "—",
      unit: asStr(o.unit).trim() || "—",
    });
  }
  return out;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asStr(x).trim()).filter(Boolean);
}

/** Coerce parsed JSON to ProcessDailyLogResult. */
export function normalizeProcessDailyLogJson(raw: unknown): ProcessDailyLogResult {
  const e = emptyProcessDailyLogResult();
  if (!raw || typeof raw !== "object") return e;
  const o = raw as Record<string, unknown>;
  return {
    job_name: asStr(o.job_name).trim() || null,
    work_completed: asStr(o.work_completed).trim(),
    materials_used: asMaterialLines(o.materials_used),
    materials_needed: asMaterialLines(o.materials_needed),
    employees_onsite: asStringArray(o.employees_onsite),
    check_in: asStr(o.check_in).trim() || null,
    check_out: asStr(o.check_out).trim() || null,
    issues_delays: asStr(o.issues_delays).trim() || null,
    safety_incident: asBool(o.safety_incident, false),
    all_breakers_on: asBool(o.all_breakers_on, true),
    equipment_used: asStr(o.equipment_used).trim() || null,
    equipment_left: asStr(o.equipment_left).trim() || null,
    next_day_plan: asStr(o.next_day_plan).trim() || null,
    notes: asStr(o.notes).trim() || null,
  };
}

export function serializeMaterialLines(lines: DailyLogMaterialLine[]): string {
  return lines
    .filter((l) => l.item.trim())
    .map((l) => `${l.item.trim()} | ${l.qty.trim()} | ${l.unit.trim()}`)
    .join("\n");
}

/** Materials needed with optional [ORDER] prefix per line. */
export function serializeMaterialsNeeded(
  lines: (DailyLogMaterialLine & { order?: boolean })[],
): string {
  return lines
    .filter((l) => l.item.trim())
    .map((l) => {
      const base = `${l.item.trim()} | ${l.qty.trim()} | ${l.unit.trim()}`;
      return l.order ? `[ORDER] ${base}` : base;
    })
    .join("\n");
}

/** Parse stored "item | qty | unit" lines (optional `[ORDER]` prefix). */
export function parseStoredMaterialRows(
  text: string | null | undefined,
): (DailyLogMaterialLine & { order?: boolean })[] {
  if (!text?.trim()) return [];
  return text.split(/\r?\n/).map((raw) => {
    let line = raw.trim();
    const order = /^\[ORDER\]\s+/i.test(line);
    if (order) line = line.replace(/^\[ORDER\]\s+/i, "");
    const parts = line.split("|").map((s) => s.trim());
    return {
      item: parts[0] ?? "",
      qty: parts[1] ?? "—",
      unit: parts[2] ?? "—",
      order: order || undefined,
    };
  });
}
