"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  TeamClockCardSkeletonGrid,
} from "@/components/app-polish";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import {
  classifyEmployeeToday,
  displayName,
  formatHeaderDate,
  formatHoursHuman,
  hoursCellColor,
  initials,
  localDayBounds,
  lunchTakenMinutesRow,
  overtimeDisplay,
  punchInLocalYmd,
  todayRelevantPunches,
  type PunchRow,
  type TeamEmployee,
  weekdayColumns,
  weekMondayBounds,
  workedHoursForPunchRow,
  workedMsForPunchRow,
} from "@/lib/team-clock-utils";
import { buildActiveJobsTodayDetails } from "@/lib/team-clock-jobs-today";
import {
  completedPunchWorkedMs,
  formatMsAsHms,
  splitRegularOvertime,
} from "@/lib/time-punch-worked";
import { createBrowserClient } from "@/lib/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import {
  formatPunchGpsStatusLine,
  parsePunchLocationJson,
  teamClockGpsDotForClosedPunch,
  teamClockGpsDotForOpenPunch,
} from "@/lib/punch-gps";

type Tab = "today" | "week" | "history";

function punchGrossHours(p: PunchRow, nowMs: number): number {
  const a = new Date(p.punch_in_at).getTime();
  const b = p.punch_out_at ? new Date(p.punch_out_at).getTime() : nowMs;
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, b - a) / 3600000;
}

function punchLunchMinutesForRow(p: PunchRow, nowMs: number): number {
  if (p.punch_out_at) {
    return Math.round((Number(p.total_lunch_ms) || 0) / 60000);
  }
  return lunchTakenMinutesRow(p, nowMs);
}

function defaultCostRateUsd(): number | null {
  const raw = process.env.NEXT_PUBLIC_TEAM_CLOCK_DEFAULT_RATE_USD?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type SuperAdminDayDetailModalProps = {
  employee: TeamEmployee;
  todayYmd: string;
  nowMs: number;
  punchesForCards: PunchRow[];
  jobOpts: { id: string; job_name: string; job_number: string }[];
  onClose: () => void;
  onManual: (
    kind: "punch_in" | "punch_out" | "start_lunch" | "end_lunch",
    employeeId: string,
  ) => void;
};

function SuperAdminDayDetailModal({
  employee,
  todayYmd,
  nowMs,
  punchesForCards,
  jobOpts,
  onClose,
  onManual,
}: SuperAdminDayDetailModalProps) {
  const c = classifyEmployeeToday(
    employee.id,
    punchesForCards,
    nowMs,
    todayYmd,
  );
  const dayPunches = punchesForCards
    .filter(
      (p) =>
        p.employee_id === employee.id &&
        punchInLocalYmd(p.punch_in_at) === todayYmd,
    )
    .sort(
      (a, b) =>
        new Date(a.punch_in_at).getTime() - new Date(b.punch_in_at).getTime(),
    );

  let netH = 0;
  let grossH = 0;
  let lunchMin = 0;
  for (const p of dayPunches) {
    netH += workedHoursForPunchRow(p, nowMs);
    grossH += punchGrossHours(p, nowMs);
    lunchMin += punchLunchMinutesForRow(p, nowMs);
  }
  netH = Math.round(netH * 100) / 100;
  grossH = Math.round(grossH * 100) / 100;
  const { regular, overtime } = splitRegularOvertime(netH);

  const statusLabel =
    c.status === "working"
      ? "On the clock"
      : c.status === "lunch"
        ? "On lunch"
        : c.status === "done"
          ? "Punched out"
          : "Not in today";

  const gpsOpenLine =
    c.open != null
      ? formatPunchGpsStatusLine(
          c.open.on_lunch
            ? parsePunchLocationJson(c.open.lunch_start_location) ??
              parsePunchLocationJson(c.open.punch_in_location)
            : parsePunchLocationJson(c.open.punch_in_location),
        )
      : null;

  return (
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="emp-day-detail-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="emp-day-detail-title"
              className="text-lg font-semibold text-[var(--foreground)]"
            >
              {displayName(employee)}
            </h2>
            {employee.employee_number ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                #{employee.employee_number}
              </p>
            ) : null}
            <p className="mt-2 text-sm font-medium text-[#E8C84A]">
              {statusLabel}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]">
            Today&apos;s punch history
          </p>
          {dayPunches.length === 0 ? (
            <p className="mt-2 text-[var(--foreground-muted)]">
              No punches recorded for today.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--foreground-muted)]">
                    <th className="py-2 pr-2 font-medium">In</th>
                    <th className="py-2 pr-2 font-medium">Out</th>
                    <th className="py-2 pr-2 font-medium">Hours</th>
                    <th className="py-2 pr-2 font-medium">Job</th>
                    <th className="py-2 pr-2 font-medium">GPS (in)</th>
                    <th className="py-2 font-medium"> </th>
                  </tr>
                </thead>
                <tbody>
                  {dayPunches.map((p) => {
                    const h = workedHoursForPunchRow(p, nowMs);
                    const pinLoc = parsePunchLocationJson(p.punch_in_location);
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-[var(--border)]/60 align-top"
                      >
                        <td className="py-2 pr-2 font-mono tabular-nums text-[var(--foreground)]">
                          {new Date(p.punch_in_at).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2 pr-2 font-mono tabular-nums text-[var(--foreground)]">
                          {p.punch_out_at
                            ? new Date(p.punch_out_at).toLocaleTimeString(
                                "en-US",
                                {
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )
                            : "—"}
                        </td>
                        <td className="py-2 pr-2 font-mono tabular-nums text-[#E8C84A]">
                          {h.toFixed(2)}
                        </td>
                        <td className="py-2 pr-2 text-[var(--foreground)]">
                          {p.job_name?.trim() || "—"}
                        </td>
                        <td className="py-2 pr-2 text-[var(--foreground-muted)]">
                          {formatPunchGpsStatusLine(pinLoc)}
                        </td>
                        <td className="py-2">
                          {p.is_manual_entry ? (
                            <span className="inline-block rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">
                              Audit
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <dl className="mt-4 grid gap-2 rounded-lg border border-[var(--border)] bg-black/15 p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--foreground-muted)]">Total (gross)</dt>
            <dd className="font-mono font-semibold tabular-nums text-[var(--foreground)]">
              {grossH.toFixed(2)} h
            </dd>
          </div>
          <div>
            <dt className="text-[var(--foreground-muted)]">Lunch</dt>
            <dd className="font-mono font-semibold tabular-nums text-[var(--foreground)]">
              {lunchMin} min
            </dd>
          </div>
          <div>
            <dt className="text-[var(--foreground-muted)]">Net hours</dt>
            <dd className="font-mono font-semibold tabular-nums text-[#E8C84A]">
              {netH.toFixed(2)} h
            </dd>
          </div>
          <div>
            <dt className="text-[var(--foreground-muted)]">OT (8h rule)</dt>
            <dd className="font-mono font-semibold tabular-nums text-orange-200">
              {overtime > 0 ? `${overtime.toFixed(2)} h` : "—"}
              {overtime > 0 ? (
                <span className="ml-2 text-xs text-[var(--foreground-muted)]">
                  ({regular.toFixed(2)} h reg)
                </span>
              ) : null}
            </dd>
          </div>
        </dl>

        {gpsOpenLine ? (
          <p className="mt-3 text-xs text-[var(--foreground-muted)]">
            <span className="font-semibold text-[var(--foreground)]">
              Current GPS:{" "}
            </span>
            {gpsOpenLine}
          </p>
        ) : c.status === "not_in" ? null : (
          <p className="mt-3 text-xs text-[var(--foreground-muted)]">
            No open punch — GPS shown per row above when captured.
          </p>
        )}

        <div className="mt-5 space-y-2 border-t border-[var(--border)] pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]">
            Manual punch
          </p>
          {c.status === "not_in" ? (
            <button
              type="button"
              className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
              onClick={() => onManual("punch_in", employee.id)}
            >
              Punch In
            </button>
          ) : null}
          {c.status === "working" && c.open ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-500"
                onClick={() => onManual("punch_out", employee.id)}
              >
                Punch Out
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-amber-400 py-2.5 text-sm font-bold text-amber-950 hover:bg-amber-300"
                onClick={() => onManual("start_lunch", employee.id)}
              >
                Lunch
              </button>
            </div>
          ) : null}
          {c.status === "lunch" && c.open ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
                onClick={() => onManual("end_lunch", employee.id)}
              >
                End Lunch
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-500"
                onClick={() => onManual("punch_out", employee.id)}
              >
                Punch Out
              </button>
            </div>
          ) : null}
          {jobOpts.length === 0 && c.status === "not_in" ? (
            <p className="text-xs text-amber-200/90">
              Load jobs failed or list empty — Punch In needs a job.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function TeamClockClient() {
  const { showToast } = useAppToast();
  const { role } = useUserRole();
  const isSuperAdmin = role === "super_admin";
  const isManager = role === "admin" || role === "super_admin";
  const [tab, setTab] = useState<Tab>("today");
  const [clockTick, setClockTick] = useState(0);
  const [employees, setEmployees] = useState<TeamEmployee[]>([]);
  const [punches, setPunches] = useState<PunchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyFrom, setHistoryFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [historyTo, setHistoryTo] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [historyEmployeeId, setHistoryEmployeeId] = useState<string>("");
  const [jobsDetailOpen, setJobsDetailOpen] = useState(false);
  const [jobOpts, setJobOpts] = useState<
    { id: string; job_name: string; job_number: string }[]
  >([]);
  const [gpsModalPunchId, setGpsModalPunchId] = useState<string | null>(null);
  const [gpsReason, setGpsReason] = useState("");
  const [gpsBusy, setGpsBusy] = useState(false);
  const [manualModal, setManualModal] = useState<
    | { kind: "punch_in"; employeeId: string }
    | { kind: "punch_out"; employeeId: string }
    | { kind: "start_lunch"; employeeId: string }
    | { kind: "end_lunch"; employeeId: string }
    | null
  >(null);
  const [manualJobId, setManualJobId] = useState("");
  const [manualAt, setManualAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [manualNote, setManualNote] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [detailEmployeeId, setDetailEmployeeId] = useState<string | null>(null);

  const resetManualFormDefaults = useCallback(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setManualAt(d.toISOString().slice(0, 16));
    setManualNote("");
  }, []);

  const openManualConfirm = useCallback(
    (
      kind:
        | "punch_in"
        | "punch_out"
        | "start_lunch"
        | "end_lunch",
      employeeId: string,
    ) => {
      resetManualFormDefaults();
      setManualModal({ kind, employeeId });
      if (kind === "punch_in") {
        setManualJobId(jobOpts[0]?.id ?? "");
      }
    },
    [jobOpts, resetManualFormDefaults],
  );

  const nowMs = useMemo(() => Date.now(), [clockTick]);
  const todayBounds = useMemo(() => localDayBounds(new Date()), [clockTick]);
  const rateUsd = defaultCostRateUsd();

  const reload = useCallback(async () => {
    setError(null);
    try {
      const sb = createBrowserClient();
      let fromIso: string;
      let toIso: string;
      if (tab === "history") {
        const a = new Date(historyFrom + "T00:00:00");
        const b = new Date(historyTo + "T00:00:00");
        b.setDate(b.getDate() + 1);
        fromIso = a.toISOString();
        toIso = b.toISOString();
      } else {
        const w = weekMondayBounds(new Date());
        fromIso = w.fromIso;
        toIso = w.toIso;
      }

      const punchSelect =
        "id,employee_id,job_id,job_name,punch_in_at,punch_out_at,on_lunch,lunch_start_at,total_lunch_ms,punch_in_location,lunch_start_location,gps_override_at,gps_location_flagged,is_manual_entry,manual_entry_by,manual_entry_at,manual_entry_note";

      const [empRes, punchOpenRes, punchWeekRes, punchHistoryRes, jobsPickRes] =
        await Promise.all([
          sb
            .from("user_profiles")
            .select(
              "id,email,full_name,first_name,last_name,employee_number,show_punch_interface,is_active",
            )
            .eq("show_punch_interface", true)
            .eq("is_active", true)
            .order("full_name", { ascending: true }),
          tab === "history"
            ? Promise.resolve({ data: [] as unknown[], error: null })
            : sb
                .from("time_punches")
                .select(punchSelect)
                .is("punch_out_at", null)
                .order("punch_in_at", { ascending: false }),
          tab === "history"
            ? Promise.resolve({ data: [] as unknown[], error: null })
            : sb
                .from("time_punches")
                .select(punchSelect)
                .gte("punch_in_at", fromIso)
                .lt("punch_in_at", toIso)
                .order("punch_in_at", { ascending: false }),
          tab === "history"
            ? sb
                .from("time_punches")
                .select(punchSelect)
                .gte("punch_in_at", fromIso)
                .lt("punch_in_at", toIso)
                .order("punch_in_at", { ascending: false })
            : Promise.resolve({ data: [] as unknown[], error: null }),
          isSuperAdmin
            ? sb
                .from("jobs")
                .select("id,job_name,job_number")
                .order("updated_at", { ascending: false })
                .limit(100)
            : Promise.resolve({ data: [] as unknown[], error: null }),
        ]);

      if (empRes.error) throw empRes.error;
      if (tab === "history") {
        if (punchHistoryRes.error) throw punchHistoryRes.error;
      } else {
        if (punchOpenRes.error) throw punchOpenRes.error;
        if (punchWeekRes.error) throw punchWeekRes.error;
      }
      if (isSuperAdmin && jobsPickRes.error) throw jobsPickRes.error;

      setEmployees(
        (empRes.data ?? []).map((r) => ({
          id: r.id as string,
          email: String(r.email ?? ""),
          full_name: String(r.full_name ?? ""),
          first_name: String(r.first_name ?? ""),
          last_name: String(r.last_name ?? ""),
          employee_number: String(r.employee_number ?? ""),
        })),
      );

      let rows: PunchRow[];
      if (tab === "history") {
        rows = (punchHistoryRes.data ?? []) as PunchRow[];
      } else {
        const map = new Map<string, PunchRow>();
        for (const r of [
          ...(punchOpenRes.data ?? []),
          ...(punchWeekRes.data ?? []),
        ] as PunchRow[]) {
          map.set(r.id, r);
        }
        rows = [...map.values()].sort(
          (a, b) =>
            new Date(b.punch_in_at).getTime() -
            new Date(a.punch_in_at).getTime(),
        );
      }
      if (tab === "history" && historyEmployeeId.trim()) {
        rows = rows.filter((p) => p.employee_id === historyEmployeeId.trim());
      }

      const manualIds = new Set<string>();
      for (const r of rows) {
        if (r.manual_entry_by) manualIds.add(r.manual_entry_by);
      }
      if (manualIds.size) {
        const { data: mprofs, error: mErr } = await sb
          .from("user_profiles")
          .select("id,first_name,last_name,full_name,email")
          .in("id", [...manualIds]);
        if (mErr) throw mErr;
        const nameById = new Map<string, string>();
        for (const p of mprofs ?? []) {
          nameById.set(
            p.id as string,
            displayName({
              id: p.id as string,
              email: String(p.email ?? ""),
              full_name: String(p.full_name ?? ""),
              first_name: String(p.first_name ?? ""),
              last_name: String(p.last_name ?? ""),
              employee_number: "",
            }),
          );
        }
        rows = rows.map((r) => ({
          ...r,
          manual_entry_by_name: r.manual_entry_by
            ? (nameById.get(r.manual_entry_by) ?? "—")
            : null,
        }));
      }

      setPunches(rows);

      if (isSuperAdmin) {
        const jrows = (jobsPickRes.data ?? []) as {
          id: string;
          job_name?: string | null;
          job_number?: string | null;
        }[];
        setJobOpts(
          jrows.map((j) => ({
            id: j.id,
            job_name: String(j.job_name ?? ""),
            job_number: String(j.job_number ?? ""),
          })),
        );
      } else {
        setJobOpts([]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Load failed.";
      setError(msg);
      setPunches([]);
      showToast({ message: msg, variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [
    tab,
    historyFrom,
    historyTo,
    historyEmployeeId,
    showToast,
    isSuperAdmin,
  ]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const id = window.setInterval(() => setClockTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const sb = createBrowserClient();
    const ch = sb
      .channel("team-clock-punches")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_punches" },
        () => {
          void reload();
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [reload]);

  useEffect(() => {
    const id = window.setInterval(() => void reload(), 30000);
    return () => window.clearInterval(id);
  }, [reload]);

  const weekPunchesForToday = useMemo(() => {
    const w = weekMondayBounds(new Date());
    return punches.filter(
      (p) => p.punch_in_at >= w.fromIso && p.punch_in_at < w.toIso,
    );
  }, [punches, clockTick]);

  const punchesForCards = useMemo(
    () => todayRelevantPunches(weekPunchesForToday, todayBounds.ymd),
    [weekPunchesForToday, todayBounds.ymd, clockTick],
  );

  const summary = useMemo(() => {
    let working = 0;
    let lunch = 0;
    let done = 0;
    let notIn = 0;
    let totalH = 0;
    let otAlerts = 0;
    for (const e of employees) {
      const c = classifyEmployeeToday(
        e.id,
        punchesForCards,
        nowMs,
        todayBounds.ymd,
      );
      if (c.status === "working") working += 1;
      else if (c.status === "lunch") lunch += 1;
      else if (c.status === "done") done += 1;
      else notIn += 1;
      totalH += c.workedHoursToday;
      if (overtimeDisplay(c.workedHoursToday).overtime) otAlerts += 1;
    }
    return {
      working,
      lunch,
      done,
      notIn,
      totalH: Math.round(totalH * 100) / 100,
      otAlerts,
    };
  }, [employees, punchesForCards, nowMs, todayBounds.ymd]);

  const jobsTodayDetails = useMemo(() => {
    if (tab === "history") return [];
    return buildActiveJobsTodayDetails(employees, punches, nowMs);
  }, [tab, employees, punches, nowMs]);

  const weekCols = useMemo(() => weekdayColumns(new Date()), [clockTick]);

  const weekMatrix = useMemo(() => {
    const w = weekMondayBounds(new Date());
    const inWeek = punches.filter(
      (p) => p.punch_in_at >= w.fromIso && p.punch_in_at < w.toIso,
    );
    return employees.map((e) => {
      const cells: Record<string, number | null> = {};
      let total = 0;
      for (const col of weekCols) {
        let h = 0;
        for (const p of inWeek) {
          if (p.employee_id !== e.id) continue;
          if (punchInLocalYmd(p.punch_in_at) !== col.ymd) continue;
          h += workedHoursForPunchRow(p, nowMs);
        }
        const rounded = Math.round(h * 100) / 100;
        cells[col.ymd] = rounded > 0 ? rounded : null;
        total += rounded;
      }
      return { employee: e, cells, total: Math.round(total * 100) / 100 };
    });
  }, [employees, punches, weekCols, nowMs, clockTick]);

  const submitGpsOverride = async () => {
    if (!gpsModalPunchId?.trim() || !gpsReason.trim()) {
      showToast({ message: "Reason is required.", variant: "error" });
      return;
    }
    setGpsBusy(true);
    try {
      const r = await fetch("/api/time-clock/admin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "gps_override",
          punchId: gpsModalPunchId.trim(),
          reason: gpsReason.trim(),
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        showToast({
          message: j.error ?? "Override failed.",
          variant: "error",
        });
        return;
      }
      showToast({ message: "GPS override recorded.", variant: "success" });
      setGpsModalPunchId(null);
      setGpsReason("");
      void reload();
    } catch {
      showToast({ message: "Override failed.", variant: "error" });
    } finally {
      setGpsBusy(false);
    }
  };

  const submitManualPunch = async () => {
    if (!manualModal) return;
    if (!manualNote.trim()) {
      showToast({ message: "Note is required.", variant: "error" });
      return;
    }
    setManualBusy(true);
    try {
      const atIso = new Date(manualAt).toISOString();
      let body: Record<string, unknown> = { action: "" };
      if (manualModal.kind === "punch_in") {
        if (!manualJobId.trim()) {
          showToast({ message: "Choose a job.", variant: "error" });
          return;
        }
        body = {
          action: "manual_punch_in",
          employeeId: manualModal.employeeId,
          jobId: manualJobId.trim(),
          punchInAt: atIso,
          note: manualNote.trim(),
        };
      } else if (manualModal.kind === "punch_out") {
        body = {
          action: "manual_punch_out",
          employeeId: manualModal.employeeId,
          punchOutAt: atIso,
          note: manualNote.trim(),
        };
      } else if (manualModal.kind === "start_lunch") {
        body = {
          action: "manual_start_lunch",
          employeeId: manualModal.employeeId,
          at: atIso,
          note: manualNote.trim(),
        };
      } else {
        body = {
          action: "manual_end_lunch",
          employeeId: manualModal.employeeId,
          at: atIso,
          note: manualNote.trim(),
        };
      }
      const r = await fetch("/api/time-clock/admin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        showToast({
          message: j.error ?? "Manual punch failed.",
          variant: "error",
        });
        return;
      }
      showToast({ message: "Saved.", variant: "success" });
      setManualModal(null);
      void reload();
    } catch {
      showToast({ message: "Manual punch failed.", variant: "error" });
    } finally {
      setManualBusy(false);
    }
  };

  const exportHistoryCsv = () => {
    const lines = [
      [
        "employee_name",
        "employee_id",
        "job_name",
        "punch_in",
        "punch_out",
        "worked_hours",
        "lunch_minutes",
      ].join(","),
    ];
    for (const p of punches) {
      const emp = employees.find((e) => e.id === p.employee_id);
      const name = emp ? displayName(emp) : p.employee_id;
      const worked = workedHoursForPunchRow(p, nowMs);
      const lunchM = p.punch_out_at
        ? Math.round(
            (Number(p.total_lunch_ms) || 0) / 60000,
          )
        : lunchTakenMinutesRow(p, nowMs);
      const esc = (s: string) =>
        /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      lines.push(
        [
          esc(name),
          p.employee_id,
          esc((p.job_name ?? "").trim()),
          p.punch_in_at,
          p.punch_out_at ?? "",
          worked.toFixed(2),
          String(lunchM),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `team-clock-${historyFrom}-${historyTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabBtn = (t: Tab, label: string) => (
    <button
      key={t}
      type="button"
      onClick={() => {
        setTab(t);
        setLoading(true);
      }}
      className={
        tab === t
          ? "rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628]"
          : "rounded-lg px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/10"
      }
    >
      {label}
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[var(--surface-card)]">
      <WideAppHeader active="team_clock" showTppSubtitle />
      <main className="app-page-shell mx-auto max-w-6xl flex-1 py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--foreground)]">
              Team Time Clock
            </h1>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              {formatHeaderDate(new Date())}
            </p>
            <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
              Live updates via Supabase Realtime · backup refresh every 30s
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-[#E8C84A] hover:underline"
          >
            ← Dashboard
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {tabBtn("today", "Today")}
          {tabBtn("week", "This week")}
          {tabBtn("history", "History")}
        </div>

        {error ? (
          <p className="mt-4 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {tab === "today" && !loading && employees.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<span aria-hidden>👷</span>}
              title="No punch-enabled employees"
              description="Turn on “Show punch interface” and keep accounts active in user profiles so field staff appear here."
              actionLabel="Project dashboard"
              actionHref="/dashboard"
            />
          </div>
        ) : null}

        {tab === "today" && !loading && employees.length > 0 ? (
          <>
            <div className="mt-6 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-sm">
              <div className="flex flex-wrap gap-3">
                <span className="rounded-lg bg-emerald-500/15 px-3 py-1.5 font-medium text-emerald-200">
                  🟢 {summary.working} Working
                </span>
                <span className="rounded-lg bg-amber-500/15 px-3 py-1.5 font-medium text-amber-200">
                  🟡 {summary.lunch} On lunch
                </span>
                <span className="rounded-lg bg-red-500/10 px-3 py-1.5 font-medium text-red-200/90">
                  🔴 {summary.done} Done
                </span>
                <span className="rounded-lg bg-white/10 px-3 py-1.5 font-medium text-white/60">
                  ⚫ {summary.notIn} Not in
                </span>
                <button
                  type="button"
                  onClick={() => setJobsDetailOpen((o) => !o)}
                  className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                    jobsDetailOpen
                      ? "bg-sky-500/25 text-sky-100 ring-1 ring-sky-400/40"
                      : "bg-sky-500/15 text-sky-200 hover:bg-sky-500/20"
                  }`}
                  aria-expanded={jobsDetailOpen}
                >
                  🏗️ {jobsTodayDetails.length} Active job
                  {jobsTodayDetails.length === 1 ? "" : "s"} today
                  <span className="ml-1.5 text-xs opacity-80" aria-hidden>
                    {jobsDetailOpen ? "▼" : "▶"}
                  </span>
                </button>
                <span className="w-full font-semibold tabular-nums text-[#E8C84A] sm:ml-auto sm:w-auto">
                  Total hours today: {summary.totalH} hrs
                </span>
                {summary.otAlerts > 0 ? (
                  <span className="w-full text-xs font-semibold text-orange-300 sm:w-auto">
                    ⚠️ {summary.otAlerts} overtime alert
                    {summary.otAlerts === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>

              {jobsDetailOpen ? (
                <div
                  className="border-t border-[var(--border)] pt-4"
                  role="region"
                  aria-label="Active jobs detail"
                >
                  {jobsTodayDetails.length === 0 ? (
                    <p className="text-sm text-[var(--foreground-muted)]">
                      No job hours logged yet today.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {jobsTodayDetails.map((j) => (
                        <li
                          key={j.key}
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-4 py-3"
                        >
                          <p className="font-semibold text-[var(--foreground)]">
                            {j.jobName}
                          </p>
                          <dl className="mt-2 grid gap-1 text-xs text-[var(--foreground-muted)] sm:grid-cols-2">
                            <div>
                              <dt className="inline font-medium text-[var(--foreground)]">
                                On site now:{" "}
                              </dt>
                              <dd className="inline tabular-nums text-[#E8C84A]">
                                {j.onSiteCount}
                              </dd>
                            </div>
                            <div>
                              <dt className="inline font-medium text-[var(--foreground)]">
                                Hours today:{" "}
                              </dt>
                              <dd className="inline tabular-nums">{j.hours}h</dd>
                            </div>
                            <div className="sm:col-span-2">
                              <dt className="font-medium text-[var(--foreground)]">
                                Employees on job
                              </dt>
                              <dd className="mt-0.5 text-[var(--foreground-muted)]">
                                {j.employeeNames.length > 0
                                  ? j.employeeNames.join(", ")
                                  : "—"}
                              </dd>
                            </div>
                          </dl>
                          {rateUsd != null ? (
                            <p className="mt-2 text-xs text-[#E8C84A]">
                              Est. labor: $
                              {(j.hours * rateUsd).toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              @ ${rateUsd}/hr
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-[var(--foreground-muted)]">
                              Set{" "}
                              <code className="rounded bg-black/20 px-1">
                                NEXT_PUBLIC_TEAM_CLOCK_DEFAULT_RATE_USD
                              </code>{" "}
                              for cost estimate.
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>

            {employees.length > 0 &&
            summary.working === 0 &&
            summary.lunch === 0 ? (
              <div
                className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 text-center"
                role="status"
              >
                <p className="text-base font-semibold text-[var(--foreground)]">
                  No one is on the clock right now
                </p>
                <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                  Everyone is punched out, on break, or has not started yet.
                  Cards below show each person&apos;s status for today.
                </p>
              </div>
            ) : null}

            <section className="mt-8">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                Team
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {employees.map((e) => {
                  void clockTick;
                  const c = classifyEmployeeToday(
                    e.id,
                    punchesForCards,
                    nowMs,
                    todayBounds.ymd,
                  );
                  const ot = overtimeDisplay(c.workedHoursToday);
                  const gpsTier = c.open
                    ? teamClockGpsDotForOpenPunch({
                        punch_in_location: c.open.punch_in_location,
                        lunch_start_location: c.open.lunch_start_location,
                        gps_override_at: c.open.gps_override_at ?? null,
                        on_lunch: c.open.on_lunch,
                      })
                    : c.lastDoneToday
                      ? teamClockGpsDotForClosedPunch({
                          punch_in_location: c.lastDoneToday.punch_in_location,
                          gps_override_at:
                            c.lastDoneToday.gps_override_at ?? null,
                        })
                      : "red";
                  const dotBg =
                    gpsTier === "green"
                      ? "bg-emerald-400"
                      : gpsTier === "yellow"
                        ? "bg-amber-400"
                        : "bg-red-500";
                  const border =
                    c.status === "working"
                      ? ot.overtime
                        ? "border-orange-500/70 ring-2 ring-orange-500/30"
                        : ot.approaching
                          ? "border-amber-400/70"
                          : "border-emerald-500/50"
                      : c.status === "lunch"
                        ? "border-amber-400/60"
                        : c.status === "done"
                          ? "border-rose-500/35"
                          : "border-zinc-600/70 bg-black/20";

                  const cardInteractive = isSuperAdmin && tab === "today";

                  return (
                    <div
                      key={e.id}
                      role={cardInteractive ? "button" : undefined}
                      tabIndex={cardInteractive ? 0 : undefined}
                      onClick={
                        cardInteractive
                          ? () => setDetailEmployeeId(e.id)
                          : undefined
                      }
                      onKeyDown={
                        cardInteractive
                          ? (ev) => {
                              if (ev.key === "Enter" || ev.key === " ") {
                                ev.preventDefault();
                                setDetailEmployeeId(e.id);
                              }
                            }
                          : undefined
                      }
                      className={`rounded-xl border-2 bg-[var(--surface-elevated)] p-4 shadow-sm ${border} ${cardInteractive ? "cursor-pointer transition hover:ring-2 hover:ring-[#E8C84A]/35" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#E8C84A]/20 text-sm font-bold text-[#E8C84A]">
                          {initials(e)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
                            <span
                              className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dotBg}`}
                              title="GPS vs job site"
                              aria-hidden
                            />
                            {displayName(e)}
                          </p>
                          {e.employee_number ? (
                            <p className="text-xs text-[var(--foreground-muted)]">
                              #{e.employee_number}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[var(--foreground-muted)]">
                        {c.status === "working"
                          ? "🟢 On the clock"
                          : c.status === "lunch"
                            ? "🟡 On lunch"
                            : c.status === "done"
                              ? "🔴 Punched out"
                              : "⚫ Not in today"}
                      </p>
                      {c.open ? (
                        <>
                          {c.open.is_manual_entry &&
                          c.open.manual_entry_by_name ? (
                            <p className="mt-2 inline-block rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                              Manual entry by {c.open.manual_entry_by_name}
                            </p>
                          ) : null}
                          <p className="mt-2 text-sm text-[var(--foreground)]">
                            {c.open.job_name?.trim() || "—"}
                          </p>
                          <p className="text-xs text-[var(--foreground-muted)]">
                            In:{" "}
                            {new Date(c.open.punch_in_at).toLocaleTimeString(
                              "en-US",
                              {
                                hour: "numeric",
                                minute: "2-digit",
                              },
                            )}
                          </p>
                          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[#E8C84A]">
                            {formatMsAsHms(
                              workedMsForPunchRow(c.open, nowMs),
                            )}
                          </p>
                          {lunchTakenMinutesRow(c.open, nowMs) > 0 ? (
                            <p className="text-xs text-[var(--foreground-muted)]">
                              Lunch taken:{" "}
                              {lunchTakenMinutesRow(c.open, nowMs)} min
                            </p>
                          ) : null}
                        </>
                      ) : null}
                      {c.status === "done" && c.lastDoneToday ? (
                        <>
                          {c.lastDoneToday.is_manual_entry &&
                          c.lastDoneToday.manual_entry_by_name ? (
                            <p className="mt-2 inline-block rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                              Manual entry by{" "}
                              {c.lastDoneToday.manual_entry_by_name}
                            </p>
                          ) : null}
                          <p className="mt-2 text-sm text-[var(--foreground)]">
                            Job: {c.lastDoneToday.job_name?.trim() || "—"}
                          </p>
                          <p className="text-sm text-[var(--foreground-muted)]">
                            Total:{" "}
                            {formatHoursHuman(
                              workedHoursForPunchRow(c.lastDoneToday, nowMs),
                            )}
                          </p>
                          {(() => {
                            const ms = completedPunchWorkedMs(
                              c.lastDoneToday.punch_in_at,
                              c.lastDoneToday.punch_out_at!,
                              Number(c.lastDoneToday.total_lunch_ms) || 0,
                            );
                            const h = ms / 3600000;
                            const { overtime } = splitRegularOvertime(h);
                            if (overtime <= 0) return null;
                            return (
                              <p className="text-xs text-orange-200">
                                OT: {formatHoursHuman(overtime)}
                              </p>
                            );
                          })()}
                        </>
                      ) : null}
                      {c.status === "not_in" ? (
                        <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                          Not yet clocked in.
                        </p>
                      ) : null}
                      {ot.approaching && c.status !== "not_in" ? (
                        <p className="mt-2 text-xs font-medium text-amber-200">
                          Approaching OT (7.5+ hrs)
                        </p>
                      ) : null}
                      {ot.overtime && c.status !== "not_in" ? (
                        <p className="mt-1 text-xs font-bold text-orange-300">
                          OT: {ot.otHms}
                        </p>
                      ) : null}
                      {isManager &&
                      tab === "today" &&
                      c.open &&
                      !c.open.gps_override_at &&
                      c.open.gps_location_flagged ? (
                        <button
                          type="button"
                          className="mt-2 w-full rounded-lg border border-amber-500/40 px-2 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/10"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setGpsReason("");
                            setGpsModalPunchId(c.open!.id);
                          }}
                        >
                          🚩 GPS override…
                        </button>
                      ) : null}
                      {isSuperAdmin && tab === "today" ? (
                        <p className="mt-3 border-t border-[var(--border)] pt-3 text-center text-[11px] font-medium text-[var(--foreground-muted)]">
                          Tap card for details and manual punches
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

          </>
        ) : null}

        {tab === "week" && !loading ? (
          <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--foreground-muted)]">
                  <th className="px-3 py-2 font-medium">Name</th>
                  {weekCols.map((c) => (
                    <th key={c.ymd} className="px-2 py-2 text-center font-medium">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {weekMatrix.map((row) => (
                  <tr
                    key={row.employee.id}
                    className="border-b border-[var(--border)]/60"
                  >
                    <td className="px-3 py-2 font-medium text-[var(--foreground)]">
                      {displayName(row.employee)}
                    </td>
                    {weekCols.map((c) => {
                      const h = row.cells[c.ymd];
                      return (
                        <td
                          key={c.ymd}
                          className={`px-2 py-2 text-center tabular-nums ${hoursCellColor(h)}`}
                        >
                          {h != null ? h : "—"}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-[var(--foreground)]">
                      {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "history" ? (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
              <label className="text-xs text-[var(--foreground-muted)]">
                From
                <input
                  type="date"
                  className="app-input mt-1 block"
                  value={historyFrom}
                  onChange={(e) => setHistoryFrom(e.target.value)}
                />
              </label>
              <label className="text-xs text-[var(--foreground-muted)]">
                To
                <input
                  type="date"
                  className="app-input mt-1 block"
                  value={historyTo}
                  onChange={(e) => setHistoryTo(e.target.value)}
                />
              </label>
              <label className="text-xs text-[var(--foreground-muted)]">
                Employee
                <select
                  className="app-input mt-1 block min-w-[10rem]"
                  value={historyEmployeeId}
                  onChange={(e) => setHistoryEmployeeId(e.target.value)}
                >
                  <option value="">All</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {displayName(e)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void reload()}
                className="self-end rounded-lg border border-white/20 px-3 py-2 text-sm"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={exportHistoryCsv}
                className="self-end rounded-lg bg-[#E8C84A] px-3 py-2 text-sm font-bold text-[#0a1628]"
              >
                Export CSV
              </button>
            </div>
            {!loading ? (
              <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--foreground-muted)]">
                      <th className="px-3 py-2">Employee</th>
                      <th className="px-3 py-2">Job</th>
                      <th className="px-3 py-2">In</th>
                      <th className="px-3 py-2">Out</th>
                      <th className="px-3 py-2 text-right">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {punches.map((p) => {
                      const emp = employees.find((x) => x.id === p.employee_id);
                      return (
                        <tr
                          key={p.id}
                          className="border-b border-[var(--border)]/50"
                        >
                          <td className="px-3 py-2">
                            {emp ? displayName(emp) : p.employee_id}
                          </td>
                          <td className="px-3 py-2">
                            {p.job_name?.trim() || "—"}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-xs">
                            {new Date(p.punch_in_at).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-xs">
                            {p.punch_out_at
                              ? new Date(p.punch_out_at).toLocaleString()
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {workedHoursForPunchRow(p, nowMs).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        {loading ? <TeamClockCardSkeletonGrid cards={6} /> : null}

        {detailEmployeeId && isSuperAdmin && tab === "today"
          ? (() => {
              const emp = employees.find((x) => x.id === detailEmployeeId);
              if (!emp) return null;
              return (
                <SuperAdminDayDetailModal
                  employee={emp}
                  todayYmd={todayBounds.ymd}
                  nowMs={nowMs}
                  punchesForCards={punchesForCards}
                  jobOpts={jobOpts}
                  onClose={() => setDetailEmployeeId(null)}
                  onManual={(kind, eid) => {
                    openManualConfirm(kind, eid);
                  }}
                />
              );
            })()
          : null}

        {gpsModalPunchId ? (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="presentation"
            onClick={(ev) => {
              if (ev.target === ev.currentTarget && !gpsBusy) {
                setGpsModalPunchId(null);
                setGpsReason("");
              }
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="gps-ov-title"
              onClick={(ev) => ev.stopPropagation()}
            >
              <h2
                id="gps-ov-title"
                className="text-lg font-semibold text-[var(--foreground)]"
              >
                GPS override
              </h2>
              <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                Record a reason. This clears the GPS flag and is stored in the
                audit log.
              </p>
              <label className="mt-4 block text-xs text-[var(--foreground-muted)]">
                Reason
                <textarea
                  className="app-input mt-1 min-h-[5rem] w-full resize-y"
                  value={gpsReason}
                  onChange={(ev) => setGpsReason(ev.target.value)}
                  placeholder="Why is this punch accepted?"
                />
              </label>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={gpsBusy}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
                  onClick={() => {
                    setGpsModalPunchId(null);
                    setGpsReason("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={gpsBusy}
                  className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628]"
                  onClick={() => void submitGpsOverride()}
                >
                  {gpsBusy ? "Saving…" : "Save override"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {manualModal ? (
          <div
            className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="presentation"
            onClick={(ev) => {
              if (ev.target === ev.currentTarget && !manualBusy) {
                setManualModal(null);
              }
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="man-punch-title"
              onClick={(ev) => ev.stopPropagation()}
            >
              <h2
                id="man-punch-title"
                className="text-lg font-semibold text-[var(--foreground)]"
              >
                {manualModal.kind === "punch_in"
                  ? "Manual punch in"
                  : manualModal.kind === "punch_out"
                    ? "Manual punch out"
                    : manualModal.kind === "start_lunch"
                      ? "Manual start lunch"
                      : "Manual end lunch"}
              </h2>
              {manualModal.kind === "punch_in" ? (
                <label className="mt-4 block text-xs text-[var(--foreground-muted)]">
                  Job
                  <select
                    className="app-input mt-1 w-full"
                    value={manualJobId}
                    onChange={(ev) => setManualJobId(ev.target.value)}
                  >
                    {jobOpts.length === 0 ? (
                      <option value="">No jobs</option>
                    ) : (
                      jobOpts.map((j) => (
                        <option key={j.id} value={j.id}>
                          {(j.job_number ? `${j.job_number} · ` : "") +
                            (j.job_name || "Job")}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              ) : null}
              <label className="mt-4 block text-xs text-[var(--foreground-muted)]">
                {manualModal.kind === "punch_in" || manualModal.kind === "punch_out"
                  ? "Time"
                  : "Event time"}
                <input
                  type="datetime-local"
                  className="app-input mt-1 w-full"
                  value={manualAt}
                  onChange={(ev) => setManualAt(ev.target.value)}
                />
              </label>
              <label className="mt-4 block text-xs text-[var(--foreground-muted)]">
                Note (required — audited)
                <textarea
                  className="app-input mt-1 min-h-[4rem] w-full resize-y"
                  value={manualNote}
                  onChange={(ev) => setManualNote(ev.target.value)}
                  placeholder="Reason for this manual entry"
                  required
                />
              </label>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={manualBusy}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
                  onClick={() => setManualModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={manualBusy}
                  className="rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628]"
                  onClick={() => void submitManualPunch()}
                >
                  {manualBusy ? "Saving…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
