import {
  completedPunchWorkedMs,
  formatDecimalHoursAsReadable,
  formatMsAsHms,
  hoursFromMs,
  splitRegularOvertime,
  workedMsFromPunch,
} from "@/lib/time-punch-worked";

export type PunchRow = {
  id: string;
  employee_id: string;
  job_id: string | null;
  job_name: string | null;
  punch_in_at: string;
  punch_out_at: string | null;
  on_lunch: boolean;
  lunch_start_at: string | null;
  total_lunch_ms: number;
};

export type TeamEmployee = {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  employee_number: string;
};

export function displayName(e: TeamEmployee): string {
  const f = e.first_name?.trim();
  const l = e.last_name?.trim();
  if (f || l) return [f, l].filter(Boolean).join(" ");
  return e.full_name?.trim() || e.email?.trim() || "—";
}

export function initials(e: TeamEmployee): string {
  const f = e.first_name?.trim();
  const l = e.last_name?.trim();
  if (f?.[0] && l?.[0]) return (f[0] + l[0]).toUpperCase();
  const n = displayName(e);
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return (n[0] ?? "?").toUpperCase();
}

export function localDayBounds(d: Date): { fromIso: string; toIso: string; ymd: string } {
  const start = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    0,
    0,
    0,
    0,
  );
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const day = String(start.getDate()).padStart(2, "0");
  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString(),
    ymd: `${y}-${m}-${day}`,
  };
}

export function punchInLocalYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Open punches plus closed punches whose clock-in day is `todayYmd` (local). */
export function todayRelevantPunches(
  all: PunchRow[],
  todayYmd: string,
): PunchRow[] {
  return all.filter((p) => {
    if (!p.punch_out_at) return true;
    return punchInLocalYmd(p.punch_in_at) === todayYmd;
  });
}

export function formatHeaderDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Net worked ms for a punch row at nowMs (completed or open). */
export function workedMsForPunchRow(r: PunchRow, nowMs: number): number {
  if (r.punch_out_at) {
    return completedPunchWorkedMs(
      r.punch_in_at,
      r.punch_out_at,
      Number(r.total_lunch_ms) || 0,
    );
  }
  return workedMsFromPunch(
    {
      punch_in_at: r.punch_in_at,
      on_lunch: r.on_lunch,
      lunch_start_at: r.lunch_start_at,
      total_lunch_ms: Number(r.total_lunch_ms) || 0,
    },
    nowMs,
  );
}

export function workedHoursForPunchRow(r: PunchRow, nowMs: number): number {
  return hoursFromMs(workedMsForPunchRow(r, nowMs));
}

export type CardStatus =
  | "working"
  | "lunch"
  | "done"
  | "not_in";

export function classifyEmployeeToday(
  employeeId: string,
  punchesToday: PunchRow[],
  nowMs: number,
  todayYmd: string,
): {
  status: CardStatus;
  open: PunchRow | null;
  lastDoneToday: PunchRow | null;
  workedHoursToday: number;
} {
  const mine = punchesToday.filter((p) => p.employee_id === employeeId);
  const open = mine.find((p) => !p.punch_out_at) ?? null;
  const closedToday = mine
    .filter(
      (p) =>
        p.punch_out_at &&
        punchInLocalYmd(p.punch_in_at) === todayYmd,
    )
    .sort(
      (a, b) =>
        new Date(b.punch_out_at!).getTime() -
        new Date(a.punch_out_at!).getTime(),
    );
  const lastDoneToday = closedToday[0] ?? null;

  let workedHoursToday = 0;
  for (const p of mine) {
    if (
      p.punch_out_at &&
      punchInLocalYmd(p.punch_in_at) !== todayYmd
    ) {
      continue;
    }
    workedHoursToday += workedHoursForPunchRow(p, nowMs);
  }
  workedHoursToday = Math.round(workedHoursToday * 100) / 100;

  let status: CardStatus;
  if (open) {
    status = open.on_lunch ? "lunch" : "working";
  } else if (lastDoneToday) {
    status = "done";
  } else {
    status = "not_in";
  }

  return { status, open, lastDoneToday, workedHoursToday };
}

export function overtimeDisplay(workedHours: number): {
  approaching: boolean;
  overtime: boolean;
  otHours: number;
  otHms: string;
} {
  const { overtime: otH } = splitRegularOvertime(workedHours);
  const otMs = Math.max(0, otH * 3600000);
  return {
    approaching: workedHours >= 7.5 && workedHours < 8,
    overtime: workedHours > 8,
    otHours: Math.round(otH * 100) / 100,
    otHms: formatMsAsHms(otMs),
  };
}

export function lunchTakenMinutesRow(r: PunchRow, nowMs: number): number {
  let ms = Math.max(0, Number(r.total_lunch_ms) || 0);
  if (!r.punch_out_at && r.on_lunch && r.lunch_start_at) {
    const ls = new Date(r.lunch_start_at).getTime();
    if (!Number.isNaN(ls)) ms += Math.max(0, nowMs - ls);
  }
  return Math.round(ms / 60000);
}

export function formatHoursHuman(h: number | null | undefined): string {
  if (h == null || Number.isNaN(h)) return "—";
  return formatDecimalHoursAsReadable(h);
}

/** Monday 00:00 local through following Monday 00:00 exclusive = 7 days; we use Mon–Fri columns only. */
export function weekMondayBounds(d: Date): { fromIso: string; toIso: string } {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  const nextMon = new Date(mon);
  nextMon.setDate(nextMon.getDate() + 7);
  return { fromIso: mon.toISOString(), toIso: nextMon.toISOString() };
}

export function weekdayColumns(
  anchor: Date,
): { key: string; label: string; ymd: string }[] {
  const day = anchor.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate() + diff,
    0,
    0,
    0,
    0,
  );
  const cols: { key: string; label: string; ymd: string }[] = [];
  for (let i = 0; i < 5; i += 1) {
    const x = new Date(mon);
    x.setDate(mon.getDate() + i);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const d = String(x.getDate()).padStart(2, "0");
    const ymd = `${y}-${m}-${d}`;
    cols.push({
      key: ymd,
      label: x.toLocaleDateString("en-US", { weekday: "short" }),
      ymd,
    });
  }
  return cols;
}

export function hoursCellColor(h: number | null): string {
  if (h == null || h <= 0) return "text-white/35 bg-white/[0.03]";
  if (h >= 8) return "text-red-200 bg-red-500/15";
  if (h >= 7.5) return "text-amber-200 bg-amber-500/15";
  return "text-emerald-200 bg-emerald-500/10";
}
