"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import {
  addDays,
  endOfWeekSunday,
  num,
  startOfWeekMonday,
  toIsoDate,
} from "@/lib/time-calendar-helpers";
import type { TimesheetRow } from "@/lib/time-management-types";
import { createBrowserClient } from "@/lib/supabase/client";

const ENTRY_TYPES = [
  "regular",
  "overtime",
  "pto",
  "sick",
  "holiday",
  "unpaid",
] as const;

function timeShort(t: string | null | undefined): string {
  if (!t) return "—";
  return t.slice(0, 5);
}

function escCsv(v: string): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function statusBadge(status: string) {
  const base =
    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase";
  if (status === "approved")
    return `${base} bg-emerald-500/20 text-emerald-200`;
  if (status === "rejected") return `${base} bg-red-500/20 text-red-200`;
  return `${base} bg-amber-500/20 text-amber-100`;
}

type JobOpt = { id: string; job_name: string; job_number: string };

export function TimesheetsClient() {
  const { showToast } = useAppToast();
  const { profile, canManageTeamTime } = useUserRole();
  const [anchor, setAnchor] = useState(() => startOfWeekMonday(new Date()));
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [jobs, setJobs] = useState<JobOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const weekStartStr = useMemo(() => toIsoDate(anchor), [anchor]);
  const weekEndStr = useMemo(
    () => toIsoDate(endOfWeekSunday(anchor)),
    [anchor],
  );

  useEffect(() => {
    setRangeFrom(weekStartStr);
    setRangeTo(weekEndStr);
  }, [weekStartStr, weekEndStr]);

  const activeFrom = rangeFrom || weekStartStr;
  const activeTo = rangeTo || weekEndStr;

  const loadJobs = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      const { data } = await sb
        .from("jobs")
        .select("id,job_name,job_number")
        .order("updated_at", { ascending: false });
      setJobs(
        (data ?? []).map((j) => ({
          id: j.id as string,
          job_name: String(j.job_name ?? ""),
          job_number: String(j.job_number ?? ""),
        })),
      );
    } catch {
      setJobs([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createBrowserClient();
      const { data, error: qe } = await sb
        .from("timesheets")
        .select("*")
        .gte("log_date", activeFrom)
        .lte("log_date", activeTo)
        .order("log_date", { ascending: true })
        .order("employee_name", { ascending: true });
      if (qe) throw qe;
      setRows((data ?? []) as TimesheetRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load timesheets.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [activeFrom, activeTo]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    void load();
  }, [load]);

  const employees = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const k = r.employee_id ?? r.employee_name ?? "";
      if (k) s.add(r.employee_id ?? `name:${r.employee_name}`);
    }
    return [...s];
  }, [rows]);

  const filtered = useMemo(() => {
    if (!employeeFilter) return rows;
    return rows.filter((r) => {
      if (employeeFilter.startsWith("name:")) {
        return `name:${r.employee_name}` === employeeFilter;
      }
      return r.employee_id === employeeFilter;
    });
  }, [rows, employeeFilter]);

  const summaryByEmployee = useMemo(() => {
    const m = new Map<
      string,
      { reg: number; ot: number; pto: number; label: string }
    >();
    for (const r of filtered) {
      const key = r.employee_id ?? r.employee_name ?? "unknown";
      const label = r.employee_name ?? r.employee_id ?? "—";
      if (!m.has(key)) m.set(key, { reg: 0, ot: 0, pto: 0, label });
      const x = m.get(key)!;
      const et = r.entry_type;
      if (et === "regular") {
        x.reg += num(r.hours_worked);
        x.ot += num(r.overtime_hours);
      } else if (et === "overtime") {
        x.ot += num(r.hours_worked);
      } else if (et === "pto" || et === "sick" || et === "holiday") {
        x.pto += num(r.hours_worked);
      } else if (et === "unpaid") {
        /* count in total only */
      }
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v }));
  }, [filtered]);

  const updateRow = async (id: string, patch: Partial<TimesheetRow>) => {
    setSavingId(id);
    try {
      const sb = createBrowserClient();
      const { error: ue } = await sb.from("timesheets").update(patch).eq("id", id);
      if (ue) throw ue;
      showToast({ message: "Saved.", variant: "success" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Update failed.",
        variant: "error",
      });
    } finally {
      setSavingId(null);
    }
  };

  const approveRow = async (id: string, approve: boolean) => {
    const sb = createBrowserClient();
    const {
      data: { session },
    } = await sb.auth.getSession();
    const uid = session?.user?.id ?? null;
    await updateRow(id, {
      status: approve ? "approved" : "rejected",
      approved_by: approve ? uid : null,
      approved_at: approve ? new Date().toISOString() : null,
    });
  };

  const addBlankRow = async () => {
    if (!canManageTeamTime) return;
    const sb = createBrowserClient();
    const {
      data: { session },
    } = await sb.auth.getSession();
    try {
      const { error: ie } = await sb.from("timesheets").insert({
        employee_id: session?.user?.id ?? null,
        employee_name: profile?.full_name || profile?.email || null,
        log_date: activeFrom,
        entry_type: "regular",
        status: "pending",
        hours_worked: 0,
        overtime_hours: 0,
        daily_log_id: null,
      });
      if (ie) throw ie;
      showToast({ message: "Row added.", variant: "success" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not add row.",
        variant: "error",
      });
    }
  };

  const exportWeekCsv = () => {
    const h = [
      "Date",
      "Employee",
      "Job",
      "Check In",
      "Check Out",
      "Regular Hrs",
      "OT Hrs",
      "Type",
      "Status",
      "Notes",
    ];
    const lines = filtered.map((r) =>
      [
        r.log_date,
        r.employee_name ?? "",
        r.job_name ?? "",
        timeShort(r.check_in),
        timeShort(r.check_out),
        num(r.hours_worked),
        num(r.overtime_hours),
        r.entry_type,
        r.status,
        r.notes ?? "",
      ]
        .map((x) => escCsv(String(x)))
        .join(","),
    );
    const blob = new Blob(["\uFEFF" + h.join(",") + "\n" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `timesheets-${activeFrom}_${activeTo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportPayrollCsv = () => {
    const h = [
      "EmployeeId",
      "EmployeeName",
      "WorkDate",
      "RegularHours",
      "OvertimeHours",
      "EntryType",
      "JobName",
      "ApprovalStatus",
    ];
    const lines = filtered.map((r) =>
      [
        r.employee_id ?? "",
        r.employee_name ?? "",
        r.log_date,
        num(r.hours_worked),
        num(r.overtime_hours),
        r.entry_type,
        r.job_name ?? "",
        r.status,
      ]
        .map((x) => escCsv(String(x)))
        .join(","),
    );
    const blob = new Blob(["\uFEFF" + h.join(",") + "\n" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `payroll-${activeFrom}_${activeTo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const printSheet = () => {
    window.print();
  };

  const prevWeek = () => setAnchor((a) => addDays(a, -7));
  const nextWeek = () => setAnchor((a) => addDays(a, 7));

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="team_time" showTppSubtitle />
      <main className="app-page-shell flex-1 py-8 md:py-10">
        <div className="flex flex-col gap-4 print:hidden">
          <Link href="/dashboard" className="text-sm text-[#E8C84A] hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold text-white">Timesheets</h1>
          <p className="max-w-2xl text-sm text-white/55">
            Weekly view with entries from daily logs. Managers can edit, approve,
            or add manual rows.
          </p>
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-white/50 print:hidden">Loading…</p>
        ) : error ? (
          <p className="mt-8 text-sm text-red-300 print:hidden" role="alert">
            {error}
            <span className="mt-2 block text-white/45">
              Run{" "}
              <code className="text-[#E8C84A]">
                supabase/employee_time_management.sql
              </code>
            </span>
          </p>
        ) : (
          <>
            <section className="mt-6 flex flex-wrap items-end gap-3 print:hidden">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={prevWeek}
                  className="btn-secondary btn-h-11"
                >
                  ← Previous week
                </button>
                <button
                  type="button"
                  onClick={nextWeek}
                  className="btn-secondary btn-h-11"
                >
                  Next week →
                </button>
              </div>
              <div>
                <label className="text-xs text-white/45">From</label>
                <input
                  type="date"
                  className="app-input mt-1 block"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-white/45">To</label>
                <input
                  type="date"
                  className="app-input mt-1 block"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-white/45">Employee</label>
                <select
                  className="app-input mt-1 block min-w-[12rem]"
                  value={employeeFilter}
                  onChange={(e) => setEmployeeFilter(e.target.value)}
                >
                  <option value="">All</option>
                  {employees.map((k) => {
                    const r = rows.find(
                      (x) => (x.employee_id ?? `name:${x.employee_name}`) === k,
                    );
                    const label =
                      r?.employee_name || r?.employee_id?.slice(0, 8) || k;
                    return (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                className="btn-secondary btn-h-11"
              >
                Refresh
              </button>
            </section>

            <section className="mt-6 flex flex-wrap gap-2 print:hidden">
              <button
                type="button"
                onClick={exportWeekCsv}
                className="btn-secondary btn-h-11"
              >
                Export week CSV
              </button>
              <button
                type="button"
                onClick={exportPayrollCsv}
                className="btn-secondary btn-h-11 border-[#E8C84A]/35 text-[#E8C84A]"
              >
                Export payroll CSV
              </button>
              <button
                type="button"
                onClick={printSheet}
                className="btn-secondary btn-h-11"
              >
                Print
              </button>
              {canManageTeamTime ? (
                <button
                  type="button"
                  onClick={() => void addBlankRow()}
                  className="btn-primary btn-h-11"
                >
                  Add manual row
                </button>
              ) : null}
            </section>

            <section className="mt-8 print:mt-0">
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/55 print:text-black">
                Weekly summary
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {summaryByEmployee.length === 0 ? (
                  <p className="text-sm text-white/45">No rows in range.</p>
                ) : (
                  summaryByEmployee.map((s) => (
                    <div
                      key={s.key}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-4 print:border print:bg-white print:text-black"
                    >
                      <p className="font-semibold text-white print:text-black">
                        {s.label}
                      </p>
                      <dl className="mt-2 space-y-1 text-sm text-white/70 print:text-black">
                        <div className="flex justify-between">
                          <dt>Regular</dt>
                          <dd className="font-mono text-[#E8C84A] print:text-black">
                            {s.reg}h
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Overtime</dt>
                          <dd className="font-mono">{s.ot}h</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>PTO / sick / holiday</dt>
                          <dd className="font-mono">{s.pto}h</dd>
                        </div>
                        <div className="flex justify-between border-t border-white/10 pt-1 font-semibold print:border-gray-300">
                          <dt>Total paid (reg+OT+PTO)</dt>
                          <dd className="font-mono">
                            {(s.reg + s.ot + s.pto).toFixed(2)}h
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))
                )}
              </div>
            </section>

            <div
              id="timesheet-print"
              className="mt-10 overflow-x-auto rounded-xl border border-white/10 print:border-0"
            >
              <table className="min-w-full text-left text-sm text-white/85 print:text-black">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.04] print:bg-gray-100">
                    <th className="p-2">Date</th>
                    <th className="p-2">Employee</th>
                    <th className="p-2">Job</th>
                    <th className="p-2">In</th>
                    <th className="p-2">Out</th>
                    <th className="p-2">Reg</th>
                    <th className="p-2">OT</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Status</th>
                    {canManageTeamTime ? (
                      <th className="p-2 print:hidden">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-white/5 odd:bg-white/[0.02] print:odd:bg-white"
                    >
                      <td className="p-2 font-mono text-xs">
                        {canManageTeamTime ? (
                          <input
                            type="date"
                            className="app-input !py-1 !text-xs"
                            defaultValue={r.log_date}
                            onBlur={(e) => {
                              if (e.target.value !== r.log_date) {
                                void updateRow(r.id, { log_date: e.target.value });
                              }
                            }}
                          />
                        ) : (
                          r.log_date
                        )}
                      </td>
                      <td className="p-2 max-w-[10rem] truncate text-xs">
                        {r.employee_name ?? "—"}
                      </td>
                      <td className="p-2">
                        {canManageTeamTime ? (
                          <select
                            className="app-input !py-1 !text-xs max-w-[10rem]"
                            value={r.job_id ?? ""}
                            onChange={(e) => {
                              const jid = e.target.value || null;
                              const j = jobs.find((x) => x.id === jid);
                              void updateRow(r.id, {
                                job_id: jid,
                                job_name: j
                                  ? `${j.job_number} · ${j.job_name}`
                                  : null,
                              });
                            }}
                          >
                            <option value="">—</option>
                            {jobs.map((j) => (
                              <option key={j.id} value={j.id}>
                                {j.job_number} · {j.job_name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="truncate text-xs">
                            {r.job_name ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {canManageTeamTime ? (
                          <input
                            type="time"
                            className="app-input !py-1 !text-xs w-[6.5rem]"
                            defaultValue={r.check_in?.slice(0, 5) ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value;
                              const db = v ? `${v}:00` : null;
                              if (db !== r.check_in) {
                                void updateRow(r.id, { check_in: db });
                              }
                            }}
                          />
                        ) : (
                          timeShort(r.check_in)
                        )}
                      </td>
                      <td className="p-2">
                        {canManageTeamTime ? (
                          <input
                            type="time"
                            className="app-input !py-1 !text-xs w-[6.5rem]"
                            defaultValue={r.check_out?.slice(0, 5) ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value;
                              const db = v ? `${v}:00` : null;
                              if (db !== r.check_out) {
                                void updateRow(r.id, { check_out: db });
                              }
                            }}
                          />
                        ) : (
                          timeShort(r.check_out)
                        )}
                      </td>
                      <td className="p-2">
                        {canManageTeamTime ? (
                          <input
                            type="number"
                            step="0.25"
                            className="app-input !py-1 !text-xs w-20"
                            defaultValue={num(r.hours_worked)}
                            onBlur={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!Number.isNaN(v) && v !== num(r.hours_worked)) {
                                void updateRow(r.id, { hours_worked: v });
                              }
                            }}
                          />
                        ) : (
                          num(r.hours_worked)
                        )}
                      </td>
                      <td className="p-2">
                        {canManageTeamTime ? (
                          <input
                            type="number"
                            step="0.25"
                            className="app-input !py-1 !text-xs w-20"
                            defaultValue={num(r.overtime_hours)}
                            onBlur={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!Number.isNaN(v) && v !== num(r.overtime_hours)) {
                                void updateRow(r.id, { overtime_hours: v });
                              }
                            }}
                          />
                        ) : (
                          num(r.overtime_hours)
                        )}
                      </td>
                      <td className="p-2">
                        {canManageTeamTime ? (
                          <select
                            className="app-input !py-1 !text-xs"
                            value={r.entry_type}
                            onChange={(e) => {
                              void updateRow(r.id, {
                                entry_type: e.target.value,
                              });
                            }}
                          >
                            {ENTRY_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        ) : (
                          r.entry_type
                        )}
                      </td>
                      <td className="p-2">
                        <span className={statusBadge(r.status)}>{r.status}</span>
                      </td>
                      {canManageTeamTime ? (
                        <td className="p-2 print:hidden">
                          <div className="flex flex-wrap gap-1">
                            {r.status === "pending" ? (
                              <>
                                <button
                                  type="button"
                                  disabled={savingId === r.id}
                                  onClick={() => void approveRow(r.id, true)}
                                  className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={savingId === r.id}
                                  onClick={() => void approveRow(r.id, false)}
                                  className="rounded bg-red-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-red-500"
                                >
                                  Reject
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <style>{`
              @media print {
                body { background: white !important; color: black !important; }
                header.app-header-wide { display: none !important; }
              }
            `}</style>
          </>
        )}
      </main>
    </div>
  );
}
