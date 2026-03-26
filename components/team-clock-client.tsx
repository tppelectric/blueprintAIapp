"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
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
import {
  completedPunchWorkedMs,
  formatMsAsHms,
  splitRegularOvertime,
} from "@/lib/time-punch-worked";
import { createBrowserClient } from "@/lib/supabase/client";

type Tab = "today" | "week" | "history";

function defaultCostRateUsd(): number | null {
  const raw = process.env.NEXT_PUBLIC_TEAM_CLOCK_DEFAULT_RATE_USD?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function TeamClockClient() {
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
        "id,employee_id,job_id,job_name,punch_in_at,punch_out_at,on_lunch,lunch_start_at,total_lunch_ms";

      const [empRes, punchOpenRes, punchWeekRes, punchHistoryRes] =
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
        ]);

      if (empRes.error) throw empRes.error;
      if (tab === "history") {
        if (punchHistoryRes.error) throw punchHistoryRes.error;
      } else {
        if (punchOpenRes.error) throw punchOpenRes.error;
        if (punchWeekRes.error) throw punchWeekRes.error;
      }

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
      setPunches(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
      setPunches([]);
    } finally {
      setLoading(false);
    }
  }, [tab, historyFrom, historyTo, historyEmployeeId]);

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

  const jobsToday = useMemo(() => {
    const todayStart = todayBounds.fromIso;
    const todayEnd = todayBounds.toIso;
    const todays = punchesForCards.filter(
      (p) => p.punch_in_at >= todayStart && p.punch_in_at < todayEnd,
    );
    const byJob = new Map<
      string,
      { jobId: string | null; jobName: string; hours: number; ids: Set<string> }
    >();
    for (const p of todays) {
      const key = p.job_id ?? `__${(p.job_name ?? "").trim() || "—"}`;
      const label = (p.job_name ?? "").trim() || "—";
      let b = byJob.get(key);
      if (!b) {
        b = { jobId: p.job_id, jobName: label, hours: 0, ids: new Set() };
        byJob.set(key, b);
      }
      b.hours += workedHoursForPunchRow(p, nowMs);
      b.ids.add(p.employee_id);
    }
    for (const p of punchesForCards) {
      if (p.punch_out_at) continue;
      if (punchInLocalYmd(p.punch_in_at) !== todayBounds.ymd) {
        const key = p.job_id ?? `__${(p.job_name ?? "").trim() || "—"}`;
        const label = (p.job_name ?? "").trim() || "—";
        let b = byJob.get(key);
        if (!b) {
          b = { jobId: p.job_id, jobName: label, hours: 0, ids: new Set() };
          byJob.set(key, b);
        }
        b.hours += workedHoursForPunchRow(p, nowMs);
        b.ids.add(p.employee_id);
      }
    }
    return [...byJob.values()]
      .map((j) => ({
        ...j,
        hours: Math.round(j.hours * 100) / 100,
        employeeCount: j.ids.size,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [punchesForCards, todayBounds, nowMs]);

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

        {tab === "today" && !loading ? (
          <>
            <div className="mt-6 flex flex-wrap gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-sm">
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
              <span className="ml-auto font-semibold tabular-nums text-[#E8C84A]">
                Total hours today: {summary.totalH} hrs
              </span>
              {summary.otAlerts > 0 ? (
                <span className="w-full text-xs font-semibold text-orange-300 sm:w-auto">
                  ⚠️ {summary.otAlerts} overtime alert
                  {summary.otAlerts === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>

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

                  return (
                    <div
                      key={e.id}
                      className={`rounded-xl border-2 bg-[var(--surface-elevated)] p-4 shadow-sm ${border}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#E8C84A]/20 text-sm font-bold text-[#E8C84A]">
                          {initials(e)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--foreground)]">
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
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                Jobs today
              </h2>
              <ul className="mt-3 space-y-3">
                {jobsToday.length === 0 ? (
                  <li className="text-sm text-[var(--foreground-muted)]">
                    No job hours logged yet today.
                  </li>
                ) : (
                  jobsToday.map((j) => (
                    <li
                      key={j.jobId ?? j.jobName}
                      className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3"
                    >
                      <p className="font-medium text-[var(--foreground)]">
                        {j.jobName}
                      </p>
                      <p className="text-sm text-[var(--foreground-muted)]">
                        {j.employeeCount} on job · {j.hours} hrs today
                      </p>
                      {rateUsd != null ? (
                        <p className="text-xs text-[#E8C84A]">
                          Est. labor: $
                          {(j.hours * rateUsd).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          @ ${rateUsd}/hr
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--foreground-muted)]">
                          Set{" "}
                          <code className="rounded bg-black/20 px-1">
                            NEXT_PUBLIC_TEAM_CLOCK_DEFAULT_RATE_USD
                          </code>{" "}
                          for cost estimate.
                        </p>
                      )}
                    </li>
                  ))
                )}
              </ul>
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

        {loading ? (
          <p className="mt-8 text-[var(--foreground-muted)]">Loading…</p>
        ) : null}
      </main>
    </div>
  );
}
