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
