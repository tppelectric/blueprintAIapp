import type { DailyLogInsert, DailyLogRow } from "@/lib/daily-logs-types";

/** Normalize CSV header to logical DB field key. */
function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Map normalized CSV header → daily_logs column (first match wins). */
const HEADER_TO_FIELD: Record<string, keyof DailyLogInsert> = {
  jobtread_id: "jobtread_id",
  jobtreadid: "jobtread_id",
  external_id: "jobtread_id",
  id: "jobtread_id",
  log_date: "log_date",
  date: "log_date",
  logdate: "log_date",
  work_date: "log_date",
  job_name: "job_name",
  jobname: "job_name",
  job: "job_name",
  project: "job_name",
  job_id: "job_id",
  jobid: "job_id",
  crew_user: "crew_user",
  crew: "crew_user",
  crew_member: "crew_user",
  employee: "crew_user",
  foreman: "crew_user",
  notes: "notes",
  employees_onsite: "employees_onsite",
  employees: "employees_onsite",
  check_in: "check_in",
  checkin: "check_in",
  start_time: "check_in",
  check_out: "check_out",
  checkout: "check_out",
  end_time: "check_out",
  job_status: "job_status",
  status: "job_status",
  trades_onsite: "trades_onsite",
  trades: "trades_onsite",
  visitors_onsite: "visitors_onsite",
  visitors: "visitors_onsite",
  additional_notes: "additional_notes",
  materials_used: "materials_used",
  materials_needed: "materials_needed",
  materials_left_onsite: "materials_left_onsite",
  equipment_left_onsite: "equipment_left_onsite",
  tpp_equipment_left: "tpp_equipment_left",
  anticipated_delays: "anticipated_delays",
  delays: "anticipated_delays",
  all_breakers_on: "all_breakers_on",
  breakers_off_reason: "breakers_off_reason",
  supply_receipts: "supply_receipts",
  card_type: "card_type",
  store_receipts: "store_receipts",
  internal_notes: "internal_notes",
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      out.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  out.push(cur);
  return out;
}

export function parseCsvText(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map(parseCsvLine);
}

function parseBool(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null;
}

function parseDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const mm = us[1]!.padStart(2, "0");
    const dd = us[2]!.padStart(2, "0");
    return `${us[3]}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function parseTime(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = m[1]!.padStart(2, "0");
  const min = m[2]!.padStart(2, "0");
  const sec = (m[3] ?? "00").padStart(2, "0");
  return `${h}:${min}:${sec}`;
}

export type JobMatch = { id: string; job_name: string; job_number: string };

function matchJobId(
  jobName: string | null | undefined,
  jobNumber: string | null | undefined,
  jobs: JobMatch[],
): string | null {
  const name = (jobName ?? "").trim().toLowerCase();
  const num = (jobNumber ?? "").trim().toLowerCase();
  if (num) {
    const byNum = jobs.find((j) => j.job_number.toLowerCase() === num);
    if (byNum) return byNum.id;
  }
  if (name) {
    const byName = jobs.find(
      (j) => j.job_name.trim().toLowerCase() === name,
    );
    if (byName) return byName.id;
    const partial = jobs.find((j) =>
      name.includes(j.job_name.trim().toLowerCase()),
    );
    if (partial) return partial.id;
  }
  return null;
}

/**
 * Parse JobTread-style CSV: first row = headers. Returns inserts ready for Supabase.
 */
export function parseJobtreadDailyLogsCsv(
  csvText: string,
  jobs: JobMatch[],
): { rows: DailyLogInsert[]; errors: string[] } {
  const errors: string[] = [];
  const grid = parseCsvText(csvText);
  if (grid.length < 2) {
    return { rows: [], errors: ["CSV needs a header row and at least one data row."] };
  }
  const rawHeaders = grid[0]!.map((h) => normalizeHeader(h));
  const colIndexToField: (keyof DailyLogInsert | null)[] = rawHeaders.map(
    (h) => HEADER_TO_FIELD[h] ?? null,
  );

  const rows: DailyLogInsert[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r]!;
    const row: Partial<DailyLogInsert> = {};
    let jobNumberCsv: string | null = null;
    for (let c = 0; c < cells.length; c++) {
      if (rawHeaders[c] === "job_number" && cells[c]?.trim()) {
        jobNumberCsv = cells[c]!.trim();
        continue;
      }
      const field = colIndexToField[c];
      if (!field) continue;
      const val = cells[c] ?? "";
      if (val.trim() === "") continue;
      if (
        field === "materials_left_onsite" ||
        field === "tpp_equipment_left" ||
        field === "all_breakers_on"
      ) {
        const b = parseBool(val);
        if (b !== null) (row as Record<string, unknown>)[field] = b;
        continue;
      }
      if (field === "log_date") {
        const d = parseDate(val);
        if (d) row.log_date = d;
        continue;
      }
      if (field === "check_in" || field === "check_out") {
        const t = parseTime(val);
        if (t) (row as Record<string, unknown>)[field] = t;
        continue;
      }
      if (field === "job_id") {
        const uuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            val.trim(),
          );
        if (uuid) row.job_id = val.trim();
        continue;
      }
      (row as Record<string, unknown>)[field] = val.trim();
    }

    if (!row.log_date) {
      errors.push(`Row ${r + 1}: missing log_date`);
      continue;
    }

    const jName = row.job_name ?? null;
    const jNum =
      jobNumberCsv?.trim() ?? extractJobNumberFromName(jName);
    if (!row.job_id && (jName || jNum)) {
      row.job_id = matchJobId(jName, jNum, jobs);
    }

    rows.push({
      jobtread_id: row.jobtread_id ?? null,
      log_date: row.log_date,
      job_name: row.job_name ?? null,
      job_id: row.job_id ?? null,
      crew_user: row.crew_user ?? null,
      notes: row.notes ?? null,
      employees_onsite: row.employees_onsite ?? null,
      check_in: row.check_in ?? null,
      check_out: row.check_out ?? null,
      job_status: row.job_status ?? null,
      trades_onsite: row.trades_onsite ?? null,
      visitors_onsite: row.visitors_onsite ?? null,
      additional_notes: row.additional_notes ?? null,
      materials_used: row.materials_used ?? null,
      materials_needed: row.materials_needed ?? null,
      materials_left_onsite: row.materials_left_onsite ?? false,
      equipment_left_onsite: row.equipment_left_onsite ?? null,
      tpp_equipment_left: row.tpp_equipment_left ?? false,
      anticipated_delays: row.anticipated_delays ?? null,
      all_breakers_on: row.all_breakers_on ?? true,
      breakers_off_reason: row.breakers_off_reason ?? null,
      supply_receipts: row.supply_receipts ?? null,
      card_type: row.card_type ?? null,
      store_receipts: row.store_receipts ?? null,
      internal_notes: row.internal_notes ?? null,
    });
  }

  return { rows, errors };
}

function extractJobNumberFromName(name: string | null): string | null {
  if (!name) return null;
  const m = name.match(/^#?(\d{3,}|[A-Z]*\d+)/i);
  return m?.[1] ?? null;
}

const EXPORT_HEADERS: (keyof DailyLogRow)[] = [
  "jobtread_id",
  "log_date",
  "job_name",
  "job_id",
  "crew_user",
  "notes",
  "employees_onsite",
  "check_in",
  "check_out",
  "job_status",
  "trades_onsite",
  "visitors_onsite",
  "additional_notes",
  "materials_used",
  "materials_needed",
  "materials_left_onsite",
  "equipment_left_onsite",
  "tpp_equipment_left",
  "anticipated_delays",
  "all_breakers_on",
  "breakers_off_reason",
  "supply_receipts",
  "card_type",
  "store_receipts",
  "internal_notes",
];

function esc(v: unknown): string {
  const s =
    v === null || v === undefined
      ? ""
      : typeof v === "boolean"
        ? v
          ? "true"
          : "false"
        : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function dailyLogsToJobtreadCsv(logs: DailyLogRow[]): string {
  const header = EXPORT_HEADERS.join(",");
  const lines = logs.map((log) =>
    EXPORT_HEADERS.map((k) => esc(log[k])).join(","),
  );
  return "\uFEFF" + [header, ...lines].join("\n");
}
