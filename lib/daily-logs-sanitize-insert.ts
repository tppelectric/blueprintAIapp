import type { DailyLogInsert } from "@/lib/daily-logs-types";

/**
 * Set `DAILY_LOG_INSERT_WEATHER=true` (or `1`) when `daily_logs.weather` exists
 * (see `supabase/daily_logs_extensions_and_attachments.sql`). Otherwise the
 * `weather` column is omitted so inserts succeed on databases without it.
 */
const WEATHER_COLUMN_ENABLED =
  process.env.DAILY_LOG_INSERT_WEATHER === "1" ||
  process.env.DAILY_LOG_INSERT_WEATHER === "true";

/** Columns on `public.daily_logs` (base + extensions). Keep in sync with Supabase migrations. */
const DAILY_LOG_INSERT_KEYS = [
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
  "lunch_duration_minutes",
  "equipment_used",
  "work_completed",
  "next_day_plan",
  "safety_incident",
  "safety_incident_notes",
] as const satisfies readonly (keyof DailyLogInsert)[];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Keys that must never be sent on insert (handled separately or not columns). */
const STRIP_FROM_RAW = new Set([
  "id",
  "created_at",
  "pdf_storage_path",
  "equipment_left",
  /** Legacy / mistaken keys — not columns on `daily_logs`. */
  "weather_temp",
  "weather_conditions",
]);

function toTimeOrNull(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  if (/^\d{1,2}:\d{2}$/.test(t)) return `${t.padStart(5, "0")}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  return null;
}

function toBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1) return true;
  if (v === "false" || v === 0) return false;
  return fallback;
}

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && !Number.isNaN(n) ? n : null;
}

function jobIdOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return UUID_RE.test(s) ? s : null;
}

function textOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/**
 * Build a PostgREST-safe insert: **every** known column is set (null/boolean defaults),
 * so missing JSON keys never omit DB columns. Maps `equipment_left` → `equipment_left_onsite`.
 */
export function sanitizeDailyLogInsertPayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const equipmentLeftAlias = raw.equipment_left;
  const src: Record<string, unknown> = { ...raw };
  for (const k of STRIP_FROM_RAW) {
    delete src[k as string];
  }
  if (
    equipmentLeftAlias !== undefined &&
    src.equipment_left_onsite === undefined
  ) {
    src.equipment_left_onsite = equipmentLeftAlias;
  }

  const out: Record<string, unknown> = {};

  const logDate = textOrNull(src.log_date);
  if (!logDate) throw new Error("log_date is required (YYYY-MM-DD).");

  out.jobtread_id = textOrNull(src.jobtread_id);
  out.log_date = logDate;
  out.job_name = textOrNull(src.job_name);
  out.job_id = jobIdOrNull(src.job_id);
  out.crew_user = textOrNull(src.crew_user);
  out.notes = textOrNull(src.notes);
  out.employees_onsite = textOrNull(src.employees_onsite);
  out.check_in = toTimeOrNull(src.check_in);
  out.check_out = toTimeOrNull(src.check_out);
  out.job_status = textOrNull(src.job_status);
  out.trades_onsite = textOrNull(src.trades_onsite);
  out.visitors_onsite = textOrNull(src.visitors_onsite);
  out.additional_notes = textOrNull(src.additional_notes);
  out.materials_used = textOrNull(src.materials_used);
  out.materials_needed = textOrNull(src.materials_needed);
  out.materials_left_onsite = toBool(src.materials_left_onsite, false);
  out.equipment_left_onsite = textOrNull(src.equipment_left_onsite);
  out.tpp_equipment_left = toBool(src.tpp_equipment_left, false);
  out.anticipated_delays = textOrNull(src.anticipated_delays);
  out.all_breakers_on = toBool(src.all_breakers_on, true);
  out.breakers_off_reason = textOrNull(src.breakers_off_reason);
  out.supply_receipts = textOrNull(src.supply_receipts);
  out.card_type = textOrNull(src.card_type);
  out.store_receipts = textOrNull(src.store_receipts);
  out.internal_notes = textOrNull(src.internal_notes);
  if (WEATHER_COLUMN_ENABLED) {
    out.weather = textOrNull(src.weather);
  }
  out.lunch_duration_minutes = toIntOrNull(src.lunch_duration_minutes);
  out.equipment_used = textOrNull(src.equipment_used);
  out.work_completed = textOrNull(src.work_completed);
  out.next_day_plan = textOrNull(src.next_day_plan);
  out.safety_incident = toBool(src.safety_incident, false);
  out.safety_incident_notes = textOrNull(src.safety_incident_notes);

  for (const k of DAILY_LOG_INSERT_KEYS) {
    if (!(k in out)) {
      throw new Error(`Internal: missing sanitized key ${k}`);
    }
  }

  return out;
}
