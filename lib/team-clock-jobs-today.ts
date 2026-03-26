import {
  classifyEmployeeToday,
  displayName,
  localDayBounds,
  punchInLocalYmd,
  todayRelevantPunches,
  type PunchRow,
  type TeamEmployee,
  weekMondayBounds,
  workedHoursForPunchRow,
} from "@/lib/team-clock-utils";

export type ActiveJobTodayDetail = {
  key: string;
  jobId: string | null;
  jobName: string;
  hours: number;
  employeeNames: string[];
  onSiteCount: number;
};

function jobKeyFromPunch(p: Pick<PunchRow, "job_id" | "job_name">): string {
  return p.job_id ?? `__${(p.job_name ?? "").trim() || "—"}`;
}

function jobLabelFromPunch(p: Pick<PunchRow, "job_name">): string {
  return (p.job_name ?? "").trim() || "—";
}

function nameForId(employees: TeamEmployee[], id: string): string {
  const e = employees.find((x) => x.id === id);
  if (e) return displayName(e);
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

/**
 * Jobs with time logged today (local), hours rolled up, employee names,
 * and how many people are currently punched in on that job (working or lunch).
 */
export function buildActiveJobsTodayDetails(
  employees: TeamEmployee[],
  punches: PunchRow[],
  nowMs: number,
): ActiveJobTodayDetail[] {
  const todayBounds = localDayBounds(new Date(nowMs));
  const w = weekMondayBounds(new Date(nowMs));
  const weekPunches = punches.filter(
    (p) => p.punch_in_at >= w.fromIso && p.punch_in_at < w.toIso,
  );
  const punchesForCards = todayRelevantPunches(weekPunches, todayBounds.ymd);

  const todayStart = todayBounds.fromIso;
  const todayEnd = todayBounds.toIso;

  const byJob = new Map<
    string,
    { jobId: string | null; jobName: string; hours: number; ids: Set<string> }
  >();

  const ensure = (key: string, jobId: string | null, jobName: string) => {
    let b = byJob.get(key);
    if (!b) {
      b = { jobId, jobName, hours: 0, ids: new Set() };
      byJob.set(key, b);
    }
    return b;
  };

  for (const p of punchesForCards) {
    if (p.punch_in_at < todayStart || p.punch_in_at >= todayEnd) continue;
    const key = jobKeyFromPunch(p);
    const b = ensure(key, p.job_id, jobLabelFromPunch(p));
    b.hours += workedHoursForPunchRow(p, nowMs);
    b.ids.add(p.employee_id);
  }

  for (const p of punchesForCards) {
    if (p.punch_out_at) continue;
    if (punchInLocalYmd(p.punch_in_at) === todayBounds.ymd) continue;
    const key = jobKeyFromPunch(p);
    const b = ensure(key, p.job_id, jobLabelFromPunch(p));
    b.hours += workedHoursForPunchRow(p, nowMs);
    b.ids.add(p.employee_id);
  }

  const onSiteByKey = new Map<string, number>();
  for (const e of employees) {
    const c = classifyEmployeeToday(
      e.id,
      punchesForCards,
      nowMs,
      todayBounds.ymd,
    );
    if (c.status !== "working" && c.status !== "lunch") continue;
    if (!c.open) continue;
    const key = jobKeyFromPunch(c.open);
    onSiteByKey.set(key, (onSiteByKey.get(key) ?? 0) + 1);
  }

  return [...byJob.entries()]
    .map(([key, v]) => ({
      key,
      jobId: v.jobId,
      jobName: v.jobName,
      hours: Math.round(v.hours * 100) / 100,
      employeeNames: [...v.ids]
        .map((id) => nameForId(employees, id))
        .sort((a, b) => a.localeCompare(b)),
      onSiteCount: onSiteByKey.get(key) ?? 0,
    }))
    .sort((a, b) => b.hours - a.hours);
}

export type OpenPunchStraggler = {
  employeeName: string;
  jobName: string;
  sinceYmd: string;
};

/** Open punches whose clock-in day is not today (still running overnight). */
export function openPunchStragglers(
  punches: PunchRow[],
  todayYmd: string,
  employees: TeamEmployee[],
): OpenPunchStraggler[] {
  const out: OpenPunchStraggler[] = [];
  for (const p of punches) {
    if (p.punch_out_at) continue;
    const ymd = punchInLocalYmd(p.punch_in_at);
    if (ymd === todayYmd) continue;
    out.push({
      employeeName: nameForId(employees, p.employee_id),
      jobName: (p.job_name ?? "").trim() || "—",
      sinceYmd: ymd,
    });
  }
  return out;
}
