/** Client/server: worked time excluding completed lunch + current lunch break. */
export type PunchWorkedInput = {
  punch_in_at: string;
  on_lunch: boolean;
  lunch_start_at: string | null;
  total_lunch_ms: number;
};

export function workedMsFromPunch(
  at: PunchWorkedInput,
  nowMs: number = Date.now(),
): number {
  const start = new Date(at.punch_in_at).getTime();
  if (Number.isNaN(start)) return 0;
  const lunchAccum = Math.max(0, Number(at.total_lunch_ms) || 0);
  if (at.on_lunch && at.lunch_start_at) {
    const ls = new Date(at.lunch_start_at).getTime();
    if (!Number.isNaN(ls)) {
      return Math.max(0, ls - start - lunchAccum);
    }
  }
  return Math.max(0, nowMs - start - lunchAccum);
}

export function formatWorkedHrsMins(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} hrs ${m} min`;
}

/** Wall-clock style e.g. `0:05:23` (H:MM:SS, hours not padded). */
export function formatMsAsHms(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Punch table: under 1 hour → "X min Y sec"; 1+ hours → "X hr Y min".
 */
export function formatWorkedMsForPunchTable(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  if (h < 1) {
    const m = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (m === 0) return sec === 0 ? "0 sec" : `${sec} sec`;
    return sec > 0 ? `${m} min ${sec} sec` : `${m} min`;
  }
  const rem = totalSec - h * 3600;
  const m = Math.floor(rem / 60);
  const hrLabel = h === 1 ? "1 hr" : `${h} hr`;
  return m > 0 ? `${hrLabel} ${m} min` : hrLabel;
}

/** Converts fractional hours (e.g. 8.5) to "8 hrs 30 min" or "4 min". */
export function formatDecimalHoursAsReadable(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0 min";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return m === 0 ? "0 min" : `${m} min`;
  const hrPart = h === 1 ? "1 hr" : `${h} hrs`;
  if (m === 0) return hrPart;
  return `${hrPart} ${m} min`;
}

/** US 8+ OT split for shift summary. */
export function splitRegularOvertime(totalHours: number): {
  regular: number;
  overtime: number;
} {
  const t = Math.max(0, totalHours);
  return {
    regular: Math.min(8, t),
    overtime: Math.max(0, t - 8),
  };
}

/** Completed shift: net worked ms = (out - in) - total_lunch_ms (lunch already finalized in DB). */
export function completedPunchWorkedMs(
  punchInIso: string,
  punchOutIso: string,
  totalLunchMs: number,
): number {
  const a = new Date(punchInIso).getTime();
  const b = new Date(punchOutIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  const lunch = Math.max(0, Number(totalLunchMs) || 0);
  return Math.max(0, b - a - lunch);
}

export function hoursFromMs(ms: number): number {
  return Math.round((ms / 3600000) * 100) / 100;
}
