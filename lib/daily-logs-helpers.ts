/** Split materials / notes blocks into display lines. */
export function extractMaterialLines(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^[\s\u2022•\-\*]+/, "")
        .replace(/^\d+[\.\)]\s*/, "")
        .trim(),
    )
    .filter(Boolean);
}

function parseTimeToMinutes(t: string): number | null {
  const s = t.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(\s*(AM|PM))?$/i);
  if (!m) {
    const m24 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m24) return null;
    let h = parseInt(m24[1]!, 10);
    const min = parseInt(m24[2]!, 10);
    if (h >= 24 || min >= 60) return null;
    return h * 60 + min;
  }
  let h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  const ap = m[5]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Hours between check_in and check_out (same calendar day assumption).
 * Returns null if either missing or invalid. Adds 24h if checkout before checkin (overnight).
 */
export function hoursWorked(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined,
): number | null {
  if (!checkIn?.trim() || !checkOut?.trim()) return null;
  const a = parseTimeToMinutes(checkIn);
  const b = parseTimeToMinutes(checkOut);
  if (a === null || b === null) return null;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

export function sumHours(logs: { check_in: string | null; check_out: string | null }[]): number {
  let t = 0;
  for (const l of logs) {
    const h = hoursWorked(l.check_in, l.check_out);
    if (h != null) t += h;
  }
  return Math.round(t * 100) / 100;
}

/** ISO date string YYYY-MM-DD for week boundaries (local). */
export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isDateInRange(
  logDateStr: string,
  start: Date,
  end: Date,
): boolean {
  const t = new Date(logDateStr + "T12:00:00").getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export function endOfWeekSunday(startMonday: Date): Date {
  const x = new Date(
    startMonday.getFullYear(),
    startMonday.getMonth(),
    startMonday.getDate() + 6,
    23,
    59,
    59,
    999,
  );
  return x;
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Sum hours worked per crew_user for logs whose log_date falls in [start, end] (inclusive). */
export function hoursByCrewUserInDateRange(
  logs: {
    log_date: string;
    crew_user: string | null;
    check_in: string | null;
    check_out: string | null;
  }[],
  rangeStart: Date,
  rangeEnd: Date,
): { crew_user: string; hours: number }[] {
  const map = new Map<string, number>();
  for (const l of logs) {
    if (!isDateInRange(l.log_date, rangeStart, rangeEnd)) continue;
    const crew = l.crew_user?.trim();
    if (!crew) continue;
    const h = hoursWorked(l.check_in, l.check_out);
    if (h == null) continue;
    map.set(crew, (map.get(crew) ?? 0) + h);
  }
  return [...map.entries()]
    .map(([crew_user, hours]) => ({
      crew_user,
      hours: Math.round(hours * 100) / 100,
    }))
    .sort((a, b) => b.hours - a.hours);
}
