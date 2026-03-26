import {
  completedPunchWorkedMs,
  hoursFromMs,
  splitRegularOvertime,
  workedMsFromPunch,
} from "@/lib/time-punch-worked";

export type DayPunchRow = {
  id: string;
  punch_in_at: string;
  punch_out_at: string | null;
  job_name: string | null;
  total_lunch_ms: number;
  on_lunch: boolean;
  lunch_start_at: string | null;
};

export type DayPunchListItem = {
  id: string;
  timeIn: string;
  timeOut: string;
  hours: number;
  hoursLabel: string;
  jobName: string;
  lunchMinutes: number;
  isOpen: boolean;
  /** Cumulative net hours for the day after this row (chronological order). */
  runningTotalHours: number;
};

function lunchMsForRow(r: DayPunchRow, nowMs: number): number {
  let ms = Math.max(0, Number(r.total_lunch_ms) || 0);
  if (!r.punch_out_at && r.on_lunch && r.lunch_start_at) {
    const ls = new Date(r.lunch_start_at).getTime();
    if (!Number.isNaN(ls)) ms += Math.max(0, nowMs - ls);
  }
  return ms;
}

function timeHm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function computeDayStats(rows: DayPunchRow[], nowMs: number): {
  punches: DayPunchListItem[];
  /** Sum of (punch out − punch in) wall time; open punches use now. */
  grossHours: number;
  totalWorkedHours: number;
  totalLunchMinutes: number;
  netHours: number;
  overtimeHours: number;
  runningTotalHours: number;
} {
  let totalWorkedMs = 0;
  let totalGrossMs = 0;
  let totalLunchMsAgg = 0;

  const sorted = [...rows].sort(
    (a, b) =>
      new Date(a.punch_in_at).getTime() - new Date(b.punch_in_at).getTime(),
  );

  let cumulativeHours = 0;
  const punches: DayPunchListItem[] = sorted.map((r) => {
    const lunchMs = lunchMsForRow(r, nowMs);
    totalLunchMsAgg += lunchMs;

    let workedMs: number;
    if (r.punch_out_at) {
      workedMs = completedPunchWorkedMs(
        r.punch_in_at,
        r.punch_out_at,
        Number(r.total_lunch_ms) || 0,
      );
    } else {
      workedMs = workedMsFromPunch(
        {
          punch_in_at: r.punch_in_at,
          on_lunch: r.on_lunch,
          lunch_start_at: r.lunch_start_at,
          total_lunch_ms: Number(r.total_lunch_ms) || 0,
        },
        nowMs,
      );
    }

    totalWorkedMs += workedMs;
    const inMs = new Date(r.punch_in_at).getTime();
    const endMs = r.punch_out_at
      ? new Date(r.punch_out_at).getTime()
      : nowMs;
    if (!Number.isNaN(inMs) && !Number.isNaN(endMs) && endMs > inMs) {
      totalGrossMs += endMs - inMs;
    }
    const hours = hoursFromMs(workedMs);
    cumulativeHours = Math.round((cumulativeHours + hours) * 100) / 100;

    return {
      id: r.id,
      timeIn: timeHm(r.punch_in_at),
      timeOut: r.punch_out_at ? timeHm(r.punch_out_at) : "—",
      hours,
      hoursLabel: hours.toFixed(2),
      jobName: (r.job_name ?? "").trim() || "—",
      lunchMinutes: Math.round(lunchMs / 60000),
      isOpen: !r.punch_out_at,
      runningTotalHours: cumulativeHours,
    };
  });

  const grossHours = Math.round((totalGrossMs / 3600000) * 100) / 100;
  const totalWorkedHours = Math.round((totalWorkedMs / 3600000) * 100) / 100;
  const totalLunchMinutes = Math.round(totalLunchMsAgg / 60000);
  const netHours = totalWorkedHours;
  const { overtime } = splitRegularOvertime(netHours);
  const overtimeHours = Math.round(overtime * 100) / 100;
  const runningTotalHours = totalWorkedHours;

  return {
    punches,
    grossHours,
    totalWorkedHours,
    totalLunchMinutes,
    netHours,
    overtimeHours,
    runningTotalHours,
  };
}
