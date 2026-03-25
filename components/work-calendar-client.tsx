"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useUserRole } from "@/hooks/use-user-role";
import {
  addDays,
  eachDateInRange,
  endOfWeekSunday,
  initials,
  num,
  startOfMonth,
  startOfWeekMonday,
  toIsoDate,
} from "@/lib/time-calendar-helpers";
import type { WorkCalendarRow } from "@/lib/time-management-types";
import { createBrowserClient } from "@/lib/supabase/client";

type ViewMode = "month" | "week" | "day";

function empColor(name: string | null | undefined): string {
  const s = name ?? "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 50% 42%)`;
}

export function WorkCalendarClient() {
  const { canManageTeamTime } = useUserRole();
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [rows, setRows] = useState<WorkCalendarRow[]>([]);
  const [jobs, setJobs] = useState<{ id: string; job_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterJob, setFilterJob] = useState("");
  const [workOnly, setWorkOnly] = useState(false);
  const [timeOffOnly, setTimeOffOnly] = useState(false);

  const [dayDetail, setDayDetail] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "month") {
      const ms = startOfMonth(cursor);
      const startPad = (ms.getDay() + 6) % 7;
      const gridStart = addDays(ms, -startPad);
      const gridEnd = addDays(gridStart, 41);
      return { from: toIsoDate(gridStart), to: toIsoDate(gridEnd) };
    }
    if (view === "week") {
      const mon = startOfWeekMonday(cursor);
      const sun = endOfWeekSunday(mon);
      return { from: toIsoDate(mon), to: toIsoDate(sun) };
    }
    const d = toIsoDate(
      new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
    );
    return { from: d, to: d };
  }, [cursor, view]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createBrowserClient();
      const [{ data, error: qe }, { data: jd }] = await Promise.all([
        sb
          .from("work_calendar")
          .select("*")
          .gte("calendar_date", range.from)
          .lte("calendar_date", range.to)
          .order("calendar_date", { ascending: true }),
        sb.from("jobs").select("id,job_name").order("updated_at", { ascending: false }),
      ]);
      if (qe) throw qe;
      setRows((data ?? []) as WorkCalendarRow[]);
      setJobs(
        (jd ?? []).map((j) => ({
          id: j.id as string,
          job_name: String(j.job_name ?? ""),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load calendar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterEmployee && r.employee_id !== filterEmployee) return false;
      if (filterJob && r.job_id !== filterJob) return false;
      if (workOnly && r.event_type !== "work") return false;
      if (timeOffOnly && r.event_type !== "time_off") return false;
      return true;
    });
  }, [rows, filterEmployee, filterJob, workOnly, timeOffOnly]);

  const byDate = useMemo(() => {
    const m = new Map<string, WorkCalendarRow[]>();
    for (const r of filtered) {
      const k = r.calendar_date;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }, [filtered]);

  const employees = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      if (r.employee_id)
        m.set(r.employee_id, r.employee_name ?? r.employee_id);
    }
    return [...m.entries()];
  }, [rows]);

  const monthGrid = useMemo(() => {
    const ms = startOfMonth(cursor);
    const startPad = (ms.getDay() + 6) % 7;
    const gridStart = addDays(ms, -startPad);
    const cells: { date: string; inMonth: boolean }[] = [];
    let d = gridStart;
    for (let i = 0; i < 42; i++) {
      const iso = toIsoDate(d);
      cells.push({
        date: iso,
        inMonth: d.getMonth() === cursor.getMonth(),
      });
      d = addDays(d, 1);
    }
    return cells;
  }, [cursor]);

  const navPrev = () => {
    if (view === "month") setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
    else if (view === "week") setCursor((c) => addDays(c, -7));
    else setCursor((c) => addDays(c, -1));
  };

  const navNext = () => {
    if (view === "month") setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
    else if (view === "week") setCursor((c) => addDays(c, 7));
    else setCursor((c) => addDays(c, 1));
  };

  const title =
    view === "month"
      ? cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : view === "week"
        ? `${range.from} – ${range.to}`
        : range.from;

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="team_time" showTppSubtitle />
      <main className="app-page-shell flex-1 py-8 md:py-10">
        <Link href="/dashboard" className="text-sm text-[#E8C84A] hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">Work calendar</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/55">
          Work from daily logs and approved time off. Pending time off appears in
          the time-off list until approved.
        </p>

        <section className="mt-6 flex flex-wrap items-center gap-2">
          {(["month", "week", "day"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={
                view === v
                  ? "rounded-lg bg-[#E8C84A] px-3 py-2 text-xs font-semibold text-[#0a1628]"
                  : "rounded-lg border border-white/15 px-3 py-2 text-xs text-white/75 hover:bg-white/5"
              }
            >
              {v[0]!.toUpperCase() + v.slice(1)}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={navPrev} className="btn-secondary btn-h-11 !min-h-0 !py-2 !text-xs">
              ← Prev
            </button>
            <button type="button" onClick={navNext} className="btn-secondary btn-h-11 !min-h-0 !py-2 !text-xs">
              Next →
            </button>
          </div>
        </section>

        <p className="mt-3 text-sm font-medium text-[#E8C84A]">{title}</p>

        <section className="mt-4 flex flex-wrap gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <select
            className="app-input text-sm"
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value)}
          >
            <option value="">All employees</option>
            {employees.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="app-input text-sm"
            value={filterJob}
            onChange={(e) => setFilterJob(e.target.value)}
          >
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.job_name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={workOnly}
              onChange={(e) => {
                setWorkOnly(e.target.checked);
                if (e.target.checked) setTimeOffOnly(false);
              }}
            />
            Work only
          </label>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={timeOffOnly}
              onChange={(e) => {
                setTimeOffOnly(e.target.checked);
                if (e.target.checked) setWorkOnly(false);
              }}
            />
            Time off only
          </label>
          {canManageTeamTime ? (
            <Link
              href="/time-off"
              className="self-center text-xs text-[#E8C84A] hover:underline"
            >
              Manage time off →
            </Link>
          ) : null}
        </section>

        {loading ? (
          <p className="mt-8 text-sm text-white/50">Loading…</p>
        ) : error ? (
          <p className="mt-8 text-sm text-red-300" role="alert">
            {error}
            <span className="mt-2 block text-xs text-white/45">
              Apply <code className="text-[#E8C84A]">supabase/employee_time_management.sql</code>
            </span>
          </p>
        ) : view === "month" ? (
          <div className="mt-6 overflow-x-auto">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-white/45">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {monthGrid.map((cell) => {
                const list = byDate.get(cell.date) ?? [];
                const workN = list.filter((x) => x.event_type === "work").length;
                const offN = list.filter((x) => x.event_type === "time_off").length;
                const names = [
                  ...new Set(
                    list.map((x) => x.employee_name ?? x.employee_id ?? "?"),
                  ),
                ].slice(0, 4);
                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => setDayDetail(cell.date)}
                    className={[
                      "min-h-[5.5rem] rounded-lg border p-1 text-left text-[10px] transition-colors hover:border-[#E8C84A]/50",
                      cell.inMonth
                        ? "border-white/10 bg-white/[0.04]"
                        : "border-white/5 bg-white/[0.02] opacity-50",
                    ].join(" ")}
                  >
                    <span className="font-mono text-white/70">{cell.date.slice(8)}</span>
                    <div className="mt-1 flex flex-wrap gap-0.5">
                      {names.map((n) => (
                        <span
                          key={n}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white"
                          style={{ backgroundColor: empColor(n) }}
                          title={n}
                        >
                          {initials(n)}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 text-[9px] text-white/40">
                      {workN ? `${workN} work` : ""}
                      {workN && offN ? " · " : ""}
                      {offN ? `${offN} off` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : view === "week" ? (
          <div className="mt-6 grid grid-cols-1 gap-2 md:grid-cols-7">
            {eachDateInRange(range.from, range.to).map((iso) => {
              const list = byDate.get(iso) ?? [];
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setDayDetail(iso)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:border-[#E8C84A]/40"
                >
                  <p className="font-mono text-xs text-[#E8C84A]">{iso}</p>
                  <ul className="mt-2 space-y-2 text-xs text-white/75">
                    {list.map((r) => (
                      <li
                        key={r.id}
                        className={
                          r.event_type === "time_off"
                            ? "border-l-2 border-amber-400/60 pl-2"
                            : "border-l-2 border-sky-400/60 pl-2"
                        }
                      >
                        <span className="font-medium text-white">
                          {r.employee_name ?? "—"}
                        </span>
                        <br />
                        {r.event_type === "work" ? (
                          <>
                            {r.job_name ?? "Work"}{" "}
                            {r.hours != null ? `· ${num(r.hours)}h` : ""}
                          </>
                        ) : (
                          <span className="text-amber-100/80">Time off</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <ul className="space-y-3 text-sm">
              {(byDate.get(range.from) ?? []).map((r) => (
                <li key={r.id} className="border-b border-white/5 pb-3">
                  <span className="font-semibold text-white">
                    {r.employee_name ?? "—"}
                  </span>{" "}
                  <span className="text-white/45">({r.event_type})</span>
                  <p className="text-xs text-white/60">
                    {r.job_name ?? "—"} · {timeShort(r.check_in)}–{timeShort(r.check_out)}{" "}
                    {r.hours != null ? `· ${num(r.hours)}h` : ""}
                  </p>
                  {r.notes ? (
                    <p className="mt-1 text-xs text-white/45">{r.notes}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {dayDetail ? (
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center"
            role="dialog"
            aria-modal
            aria-label="Day detail"
          >
            <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-white/15 bg-[#0a1628] p-5 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-white">{dayDetail}</h2>
                <button
                  type="button"
                  className="rounded-lg px-3 py-1 text-sm text-white/60 hover:bg-white/10"
                  onClick={() => setDayDetail(null)}
                >
                  Close
                </button>
              </div>
              <DayDetailList date={dayDetail} rows={filtered} />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function timeShort(t: string | null | undefined): string {
  if (!t) return "—";
  return t.slice(0, 5);
}

function DayDetailList({
  date,
  rows,
}: {
  date: string;
  rows: WorkCalendarRow[];
}) {
  const dayRows = rows.filter((r) => r.calendar_date === date);
  const work = dayRows.filter((r) => r.event_type === "work");
  const off = dayRows.filter((r) => r.event_type === "time_off");
  return (
    <div className="mt-4 space-y-4 text-sm">
      <section>
        <h3 className="text-xs font-bold uppercase text-sky-200/90">Working</h3>
        {work.length === 0 ? (
          <p className="mt-1 text-white/45">Nobody scheduled from calendar.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {work.map((r) => (
              <li key={r.id} className="rounded-lg bg-white/[0.04] p-3">
                <p className="font-medium text-white">{r.employee_name ?? "—"}</p>
                <p className="text-xs text-white/55">{r.job_name ?? "—"}</p>
                <p className="font-mono text-xs text-white/45">
                  {timeShort(r.check_in)} → {timeShort(r.check_out)}
                  {r.hours != null ? ` · ${num(r.hours)}h` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-xs font-bold uppercase text-amber-200/90">Time off</h3>
        {off.length === 0 ? (
          <p className="mt-1 text-white/45">No time off entries.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {off.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-amber-500/25 bg-amber-950/20 p-3"
              >
                <p className="font-medium text-amber-50">{r.employee_name ?? "—"}</p>
                <p className="text-xs text-amber-100/70">{r.notes ?? "Time off"}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
