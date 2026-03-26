"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  formatWorkedHrsMins,
  workedMsFromPunch,
} from "@/lib/time-punch-worked";

type ActiveSession = {
  job_id: string | null;
  job_name: string | null;
  punch_in_at: string;
  on_lunch: boolean;
  lunch_start_at: string | null;
  total_lunch_ms: number;
};

type TeamRow = {
  id: string;
  fullName: string;
  jobName: string | null;
  punchInAt: string;
  onLunch: boolean;
  totalLunchMs: number;
  lunchStartAt: string | null;
};

type TimeClockPayload = {
  role: string;
  showPunchInterface: boolean;
  activeSession: ActiveSession | null;
  weekHours: number;
  teamActive: TeamRow[] | null;
  jobs: { id: string; job_name: string; job_number: string }[];
};

function formatTimeIn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function teamWorkedLabel(row: TeamRow): string {
  return formatWorkedHrsMins(
    workedMsFromPunch(
      {
        punch_in_at: row.punchInAt,
        on_lunch: row.onLunch,
        lunch_start_at: row.lunchStartAt,
        total_lunch_ms: row.totalLunchMs,
      },
      Date.now(),
    ),
  );
}

export function TimeClockSummaryCard({
  surface = "app",
}: {
  surface?: "app" | "marketing";
}) {
  const [data, setData] = useState<TimeClockPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobId, setJobId] = useState("");
  const [tick, setTick] = useState(0);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickErr, setQuickErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/time-clock", { credentials: "include" });
      if (r.status === 401) {
        setData(null);
        return;
      }
      const j = (await r.json()) as TimeClockPayload & { error?: string };
      if (!r.ok || j.error) {
        setData(null);
        return;
      }
      setData(j);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data?.activeSession) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [data?.activeSession?.punch_in_at]);

  useEffect(() => {
    if (data?.jobs?.length && !jobId) {
      setJobId(data.jobs[0]!.id);
    }
  }, [data?.jobs, jobId]);

  const shell =
    surface === "marketing"
      ? "rounded-xl border border-white/12 bg-white/[0.04] p-4 text-left text-white shadow-lg shadow-black/20 ring-1 ring-white/[0.06]"
      : "app-card rounded-xl border p-4 text-left";

  const muted =
    surface === "marketing" ? "text-white/60" : "text-[var(--foreground-muted)]";
  const fg =
    surface === "marketing" ? "text-white" : "text-[var(--foreground)]";

  const quickPunchIn = async () => {
    if (!jobId) {
      setQuickErr("Choose a job.");
      return;
    }
    setQuickBusy(true);
    setQuickErr(null);
    try {
      const r = await fetch("/api/time-clock", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "punch_in", jobId }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setQuickErr(j.error ?? "Punch in failed.");
        return;
      }
      setQuickOpen(false);
      void load();
    } catch {
      setQuickErr("Punch in failed.");
    } finally {
      setQuickBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={shell} aria-busy="true">
        <div
          className={`h-5 w-40 animate-pulse rounded ${surface === "marketing" ? "bg-white/10" : "bg-[var(--surface-elevated)]"}`}
        />
        <div
          className={`mt-3 h-24 animate-pulse rounded-lg ${surface === "marketing" ? "bg-white/10" : "bg-[var(--surface-elevated)]"}`}
        />
      </div>
    );
  }

  if (!data) return null;

  const { role, showPunchInterface, activeSession, weekHours, teamActive, jobs } =
    data;
  const isAdmin = role === "admin" || role === "super_admin";

  const selectCls =
    surface === "marketing"
      ? "mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-2 py-2 text-sm text-white"
      : "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-2 text-sm text-[var(--foreground)]";

  if (showPunchInterface) {
    const workedLive =
      activeSession &&
      formatWorkedHrsMins(
        workedMsFromPunch(
          {
            punch_in_at: activeSession.punch_in_at,
            on_lunch: activeSession.on_lunch,
            lunch_start_at: activeSession.lunch_start_at,
            total_lunch_ms: activeSession.total_lunch_ms,
          },
          Date.now(),
        ),
      );
    void tick;

    return (
      <div className={shell}>
        <h2 className={`text-base font-semibold ${fg}`}>⏱ Time Clock</h2>
        {!activeSession ? (
          <>
            <p className={`mt-2 text-sm ${muted}`}>Not clocked in today</p>
            <label className={`mt-3 block text-xs font-medium ${muted}`}>
              Job
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className={selectCls}
              >
                {jobs.length === 0 ? (
                  <option value="">No jobs</option>
                ) : (
                  jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {(j.job_number ? `${j.job_number} · ` : "") +
                        (j.job_name || "Job")}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setQuickErr(null);
                setQuickOpen(true);
              }}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-lg bg-emerald-600 text-center text-base font-bold text-white shadow-sm transition-colors hover:bg-emerald-500"
            >
              PUNCH IN
            </button>
            <Link
              href="/field"
              className={`mt-2 block text-center text-xs font-medium text-[#E8C84A] hover:underline`}
            >
              Open full time clock
            </Link>
          </>
        ) : (
          <>
            <p className={`mt-2 text-sm ${muted}`}>
              On the clock: {workedLive}
            </p>
            <p className={`mt-1 text-sm font-medium ${fg}`}>
              {activeSession.job_name?.trim() || "—"}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Link
                href="/field"
                className="flex h-12 flex-1 items-center justify-center rounded-lg bg-red-600 text-center text-base font-bold text-white shadow-sm transition-colors hover:bg-red-500"
              >
                PUNCH OUT
              </Link>
              <Link
                href="/field"
                className="flex h-11 flex-1 items-center justify-center rounded-lg bg-amber-500 text-center text-sm font-bold text-amber-950 shadow-sm transition-colors hover:bg-amber-400"
              >
                Lunch / field
              </Link>
            </div>
          </>
        )}

        {quickOpen ? (
          <div
            className="fixed inset-0 z-[300] flex items-end justify-center bg-black/70 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-punch-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setQuickOpen(false);
            }}
          >
            <div
              className={`w-full max-w-md rounded-2xl border p-5 shadow-xl ${
                surface === "marketing"
                  ? "border-white/15 bg-[#0a1628] text-white"
                  : "border-[var(--border)] bg-[var(--surface-card)] text-[var(--foreground)]"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                id="quick-punch-title"
                className="text-lg font-semibold"
              >
                Punch in
              </h3>
              <label className={`mt-4 block text-sm ${muted}`}>
                Job
                <select
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  disabled={quickBusy}
                  className={selectCls}
                >
                  {jobs.length === 0 ? (
                    <option value="">No jobs</option>
                  ) : (
                    jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {(j.job_number ? `${j.job_number} · ` : "") +
                          (j.job_name || "Job")}
                      </option>
                    ))
                  )}
                </select>
              </label>
              {quickErr ? (
                <p className="mt-2 text-sm text-amber-600 dark:text-amber-200">
                  {quickErr}
                </p>
              ) : null}
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  disabled={quickBusy}
                  onClick={() => setQuickOpen(false)}
                  className={`flex-1 rounded-lg border py-2.5 text-sm font-medium disabled:opacity-40 ${
                    surface === "marketing"
                      ? "border-white/25 text-white hover:bg-white/10"
                      : "btn-secondary btn-h-11"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={quickBusy || !jobId}
                  onClick={() => void quickPunchIn()}
                  className="btn-h-11 flex-1 rounded-lg bg-emerald-600 font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  {quickBusy ? "…" : "Punch In"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (isAdmin && teamActive) {
    const n = teamActive.length;
    void tick;
    return (
      <div className={shell}>
        <h2 className={`text-base font-semibold ${fg}`}>⏱ Team Clock</h2>
        <p className={`mt-2 text-sm ${muted}`}>
          {n} employee{n === 1 ? "" : "s"} clocked in
        </p>
        {n > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[280px] border-collapse text-left text-xs">
              <thead>
                <tr
                  className={`border-b ${surface === "marketing" ? "border-white/15" : "border-[var(--border)]"}`}
                >
                  <th className={`py-2 pr-2 font-semibold ${muted}`}>Name</th>
                  <th className={`py-2 pr-2 font-semibold ${muted}`}>Job</th>
                  <th className={`py-2 pr-2 font-semibold ${muted}`}>In</th>
                  <th className={`py-2 font-semibold ${muted}`}>Worked</th>
                </tr>
              </thead>
              <tbody>
                {teamActive.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b ${surface === "marketing" ? "border-white/10" : "border-[var(--border)]"}`}
                  >
                    <td className={`py-2 pr-2 ${fg}`}>{row.fullName}</td>
                    <td className={`max-w-[8rem] truncate py-2 pr-2 ${fg}`}>
                      {row.jobName ?? "—"}
                    </td>
                    <td className={`py-2 pr-2 tabular-nums ${fg}`}>
                      {formatTimeIn(row.punchInAt)}
                    </td>
                    <td className={`py-2 tabular-nums ${fg}`}>
                      {teamWorkedLabel(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <Link
          href="/timesheets"
          className="mt-3 inline-block text-sm font-medium text-[#E8C84A] hover:underline"
        >
          View All Timesheets →
        </Link>
      </div>
    );
  }

  if (role === "estimator" || role === "office_manager") {
    return (
      <div className={shell}>
        <h2 className={`text-base font-semibold ${fg}`}>⏱ My Time</h2>
        <p className={`mt-2 text-sm ${muted}`}>
          This week{" "}
          <span className={`font-semibold tabular-nums ${fg}`}>
            {weekHours} hours
          </span>
        </p>
        <div className="mt-3 flex flex-col gap-2 text-sm font-medium text-[#E8C84A]">
          <Link href="/timesheets" className="hover:underline">
            Timesheets →
          </Link>
          <Link href="/time-off" className="hover:underline">
            Time off →
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
