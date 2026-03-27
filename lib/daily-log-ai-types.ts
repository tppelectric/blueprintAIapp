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
  /** Optional extras the model may return (or alternate phrasing mapped here). */
  trades_onsite: string | null;
  visitors_onsite: string | null;
  job_status: string | null;
  additional_notes: string | null;
  crew_user: string | null;
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
    trades_onsite: null,
    visitors_onsite: null,
    job_status: null,
    additional_notes: null,
    crew_user: null,
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
  return v.flatMap((x) => {
    if (typeof x === "string") {
      const s = x.trim();
      return s ? [s] : [];
    }
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const name = asStr(o.name ?? o.full_name ?? o.employee).trim();
      return name ? [name] : [];
    }
    return [];
  });
}

/** Coerce parsed JSON to ProcessDailyLogResult. */
export function normalizeProcessDailyLogJson(raw: unknown): ProcessDailyLogResult {
  const e = emptyProcessDailyLogResult();
  if (!raw || typeof raw !== "object") return e;
  const o = raw as Record<string, unknown>;
  const jobNameRaw =
    o.job_name ?? o.job ?? o.project_name ?? o.site ?? o.project;
  const employeesRaw =
    o.employees_onsite ?? o.crew ?? o.people_on_site ?? o.workers ?? o.team;
  const checkInRaw =
    o.check_in ?? o.shift_start ?? o.start_time ?? o.clock_in ?? o.time_in;
  const checkOutRaw =
    o.check_out ?? o.shift_end ?? o.end_time ?? o.clock_out ?? o.time_out;
  const workRaw =
    o.work_completed ?? o.work_done ?? o.work_performed ?? o.description ?? "";
  const materialsUsedRaw = o.materials_used ?? o.materials;
  const materialsNeededRaw = o.materials_needed ?? o.materials_to_order;
  return {
    job_name: asStr(jobNameRaw).trim() || null,
    work_completed: asStr(workRaw).trim(),
    materials_used: asMaterialLines(materialsUsedRaw),
    materials_needed: asMaterialLines(materialsNeededRaw),
    employees_onsite: asStringArray(employeesRaw),
    check_in: asStr(checkInRaw).trim() || null,
    check_out: asStr(checkOutRaw).trim() || null,
    issues_delays: asStr(o.issues_delays ?? o.delays ?? o.problems).trim() || null,
    safety_incident: asBool(o.safety_incident, false),
    all_breakers_on: asBool(o.all_breakers_on, true),
    equipment_used: asStr(o.equipment_used).trim() || null,
    equipment_left: asStr(o.equipment_left ?? o.equipment_left_onsite).trim() || null,
    next_day_plan: asStr(o.next_day_plan ?? o.tomorrow ?? o.plan).trim() || null,
    notes: asStr(o.notes ?? o.general_notes).trim() || null,
    trades_onsite: asStr(o.trades_onsite).trim() || null,
    visitors_onsite: asStr(o.visitors_onsite).trim() || null,
    job_status: asStr(o.job_status).trim() || null,
    additional_notes: asStr(o.additional_notes).trim() || null,
    crew_user: asStr(o.crew_user ?? o.foreman).trim() || null,
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
