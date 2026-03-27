import type { DailyLogInsert } from "@/lib/daily-logs-types";

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
  "weather",
  "lunch_duration_minutes",
  "equipment_used",
  "work_completed",
  "next_day_plan",
  "safety_incident",
  "safety_incident_notes",
] as const satisfies readonly (keyof DailyLogInsert)[];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
 * Build a PostgREST-safe insert object: only known columns, valid UUID job_id, TIME strings, no undefined.
 */
export function sanitizeDailyLogInsertPayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of DAILY_LOG_INSERT_KEYS) {
    const v = raw[key];
    switch (key) {
      case "log_date": {
        const d = textOrNull(v);
        if (!d) throw new Error("log_date is required (YYYY-MM-DD).");
        out[key] = d;
        break;
      }
      case "job_id":
        out[key] = jobIdOrNull(v);
        break;
      case "check_in":
      case "check_out":
        out[key] = toTimeOrNull(v);
        break;
      case "lunch_duration_minutes":
        out[key] = toIntOrNull(v);
        break;
      case "materials_left_onsite":
      case "tpp_equipment_left":
      case "all_breakers_on":
        out[key] = toBool(
          v,
          key === "all_breakers_on" ? true : false,
        );
        break;
      case "safety_incident":
        out[key] = toBool(v, false);
        break;
      default:
        if (v === undefined) break;
        if (typeof v === "string" || v == null) {
          out[key] = textOrNull(v);
        } else if (typeof v === "boolean") {
          out[key] = v;
        } else if (typeof v === "number" && Number.isFinite(v)) {
          out[key] = v;
        } else {
          out[key] = textOrNull(v);
        }
    }
  }
  return out;
}
