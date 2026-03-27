"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DarkListSkeleton, EmptyState } from "@/components/app-polish";
import { DailyLogPdfActions } from "@/components/daily-log-pdf-actions";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import {
  endOfMonth,
  endOfWeekSunday,
  extractMaterialLines,
  hoursByCrewUserInDateRange,
  hoursWorked,
  startOfMonth,
  startOfWeekMonday,
  sumHours,
} from "@/lib/daily-logs-helpers";
import type { DailyLogRow } from "@/lib/daily-logs-types";
import {
  dailyLogsToJobtreadCsv,
  parseJobtreadDailyLogsCsv,
  type JobMatch,
} from "@/lib/jobtread-csv";
import { createBrowserClient } from "@/lib/supabase/client";

function logSearchHaystack(l: DailyLogRow): string {
  const parts: unknown[] = [
    l.jobtread_id,
    l.log_date,
    l.job_name,
    l.job_id,
    l.crew_user,
    l.notes,
    l.employees_onsite,
    l.check_in,
    l.check_out,
    l.job_status,
    l.trades_onsite,
    l.visitors_onsite,
    l.additional_notes,
    l.materials_used,
    l.materials_needed,
    l.equipment_left_onsite,
    l.anticipated_delays,
    l.breakers_off_reason,
    l.supply_receipts,
    l.card_type,
    l.store_receipts,
    l.internal_notes,
    l.materials_left_onsite,
    l.tpp_equipment_left,
    l.all_breakers_on,
  ];
  return parts
    .map((x) => (x === null || x === undefined ? "" : String(x)))
    .join(" ")
    .toLowerCase();
}

function timeInputValue(t: string | null | undefined): string {
  if (!t?.trim()) return "";
  const s = t.trim();
  return s.length >= 5 ? s.slice(0, 5) : s;
}

const CHUNK = 80;

export function DailyLogsClient() {
  const { showToast } = useAppToast();
  const [logs, setLogs] = useState<DailyLogRow[]>([]);
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterJobId, setFilterJobId] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [search, setSearch] = useState("");

  const [csvText, setCsvText] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<
    ReturnType<typeof parseJobtreadDailyLogsCsv>["rows"]
  >([]);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createBrowserClient();
      const [{ data: logData, error: le }, { data: jobData, error: je }] =
        await Promise.all([
          sb
            .from("daily_logs")
            .select("*")
            .order("log_date", { ascending: false })
            .order("created_at", { ascending: false }),
          sb
            .from("jobs")
            .select("id,job_name,job_number")
            .order("updated_at", { ascending: false }),
        ]);
      if (le) throw le;
      if (je) throw je;
      setLogs((logData ?? []) as DailyLogRow[]);
      setJobs(
        (jobData ?? []).map((j) => ({
          id: j.id as string,
          job_name: String(j.job_name ?? ""),
          job_number: String(j.job_number ?? ""),
        })),
      );
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Could not load daily logs.";
      setError(msg);
      setLogs([]);
      setJobs([]);
      showToast({ message: msg, variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!csvText) return;
    const { rows, errors } = parseJobtreadDailyLogsCsv(csvText, jobs);
    setPreviewRows(rows);
    setParseErrors(errors);
  }, [csvText, jobs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (filterJobId && l.job_id !== filterJobId) return false;
      if (filterDateFrom && l.log_date < filterDateFrom) return false;
      if (filterDateTo && l.log_date > filterDateTo) return false;
      if (
        filterEmployee.trim() &&
        !(l.crew_user ?? "")
          .toLowerCase()
          .includes(filterEmployee.trim().toLowerCase())
      ) {
        return false;
      }
      if (q && !logSearchHaystack(l).includes(q)) return false;
      return true;
    });
  }, [
    logs,
    filterJobId,
    filterDateFrom,
    filterDateTo,
    filterEmployee,
    search,
  ]);

  const totalHoursFiltered = useMemo(
    () => sumHours(filteredLogs),
    [filteredLogs],
  );

  const now = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeekMonday(now), [now]);
  const weekEnd = useMemo(() => endOfWeekSunday(weekStart), [weekStart]);
  const monthStart = useMemo(() => startOfMonth(now), [now]);
  const monthEnd = useMemo(() => endOfMonth(now), [now]);

  const hoursThisWeek = useMemo(
    () => hoursByCrewUserInDateRange(logs, weekStart, weekEnd),
    [logs, weekStart, weekEnd],
  );
  const hoursThisMonth = useMemo(
    () => hoursByCrewUserInDateRange(logs, monthStart, monthEnd),
    [logs, monthStart, monthEnd],
  );

  const onCsvFile = (file: File | null) => {
    setCsvText(null);
    setPreviewRows([]);
    setParseErrors([]);
    if (!file) return;
    void file.text().then((text) => {
      setCsvText(text);
    });
  };

  const runImport = async () => {
    if (previewRows.length === 0) return;
    setImporting(true);
    try {
      const sb = createBrowserClient();
      let inserted = 0;
      for (let i = 0; i < previewRows.length; i += CHUNK) {
        const slice = previewRows.slice(i, i + CHUNK);
        const { error: insE } = await sb.from("daily_logs").insert(slice);
        if (insE) throw insE;
        inserted += slice.length;
      }
      showToast({
        message: `${inserted} log${inserted === 1 ? "" : "s"} imported`,
        variant: "success",
      });
      setCsvText(null);
      setPreviewRows([]);
      setParseErrors([]);
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Import failed.",
        variant: "error",
      });
    } finally {
      setImporting(false);
    }
  };

  const exportFilteredCsv = () => {
    const csv = dailyLogsToJobtreadCsv(filteredLogs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jobtread-daily-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uniqueEmployees = useMemo(() => {
    const s = new Set<string>();
    for (const l of logs) {
      if (l.crew_user?.trim()) s.add(l.crew_user.trim());
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [logs]);

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="jobs" showTppSubtitle />
      <main className="app-page-shell flex-1 py-8 md:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <Link
              href="/jobs"
              className="text-sm text-[#E8C84A] hover:underline"
            >
              ← Jobs
            </Link>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              Daily logs
            </h1>
            <p className="mt-1 max-w-xl text-sm text-white/55">
              JobTread-style field logs — import CSV, filter, and export.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/jobs/daily-logs/new"
              className="btn-primary btn-h-11 inline-flex items-center justify-center"
            >
              New log
            </Link>
            <button
              type="button"
              disabled={filteredLogs.length === 0}
              onClick={exportFilteredCsv}
              className="btn-secondary btn-h-11 border-[#E8C84A]/45 text-[#E8C84A] disabled:opacity-40"
            >
              Export CSV (filtered)
            </button>
          </div>
        </div>

        {loading ? (
          <DarkListSkeleton className="mt-8" rows={10} />
        ) : error ? (
          <p className="mt-8 text-sm text-red-300" role="alert">
            {error}
            {error.includes("daily_logs") || error.includes("schema") ? (
              <span className="mt-2 block text-white/45">
                Apply{" "}
                <code className="text-[#E8C84A]">supabase/daily_logs.sql</code>{" "}
                in Supabase.
              </span>
            ) : null}
          </p>
        ) : (
          <>
            <section className="mt-8 grid gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-white/45">
                  Job
                </label>
                <select
                  className="app-input mt-1 w-full"
                  value={filterJobId}
                  onChange={(e) => setFilterJobId(e.target.value)}
                >
                  <option value="">All jobs</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.job_number} · {j.job_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-white/45">
                  From date
                </label>
                <input
                  type="date"
                  className="app-input mt-1 w-full"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-white/45">
                  To date
                </label>
                <input
                  type="date"
                  className="app-input mt-1 w-full"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-white/45">
                  Crew / employee
                </label>
                <input
                  type="text"
                  className="app-input mt-1 w-full"
                  list="daily-log-crew-list"
                  placeholder="Contains…"
                  value={filterEmployee}
                  onChange={(e) => setFilterEmployee(e.target.value)}
                />
                <datalist id="daily-log-crew-list">
                  {uniqueEmployees.map((e) => (
                    <option key={e} value={e} />
                  ))}
                </datalist>
              </div>
              <div className="md:col-span-2 lg:col-span-4">
                <label className="text-xs font-semibold uppercase tracking-wide text-white/45">
                  Search (all fields)
                </label>
                <input
                  type="search"
                  className="app-input mt-1 w-full"
                  placeholder="Notes, materials, status…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="md:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-3 text-sm text-white/60">
                <span>
                  Showing{" "}
                  <strong className="text-white">{filteredLogs.length}</strong> of{" "}
                  {logs.length}
                </span>
                <span className="text-[#E8C84A]">
                  Hours (filtered): {totalHoursFiltered}h
                </span>
              </div>
            </section>

            <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">
                Hours by crew (check in/out)
              </h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs text-white/45">This week (Mon–Sun)</p>
                  {hoursThisWeek.length === 0 ? (
                    <p className="mt-1 text-sm text-white/40">No hours logged.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm text-white/80">
                      {hoursThisWeek.map((r) => (
                        <li
                          key={r.crew_user}
                          className="flex justify-between gap-2"
                        >
                          <span className="truncate">{r.crew_user}</span>
                          <span className="shrink-0 font-mono text-[#E8C84A]">
                            {r.hours}h
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs text-white/45">This calendar month</p>
                  {hoursThisMonth.length === 0 ? (
                    <p className="mt-1 text-sm text-white/40">No hours logged.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm text-white/80">
                      {hoursThisMonth.map((r) => (
                        <li
                          key={r.crew_user}
                          className="flex justify-between gap-2"
                        >
                          <span className="truncate">{r.crew_user}</span>
                          <span className="shrink-0 font-mono text-[#E8C84A]">
                            {r.hours}h
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-8 rounded-xl border border-[#E8C84A]/25 bg-[#E8C84A]/5 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]">
                Import JobTread CSV
              </h2>
              <p className="mt-1 text-xs text-white/50">
                Upload an export; headers are mapped automatically. Preview
                before saving.
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                className="mt-3 block w-full max-w-md text-sm text-white/70 file:mr-3 file:rounded-lg file:border-0 file:bg-[#E8C84A] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#0a1628]"
                onChange={(e) => onCsvFile(e.target.files?.[0] ?? null)}
              />
              {parseErrors.length > 0 ? (
                <ul className="mt-3 max-h-32 overflow-auto text-xs text-amber-200/90">
                  {parseErrors.slice(0, 30).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {parseErrors.length > 30 ? (
                    <li>…and {parseErrors.length - 30} more</li>
                  ) : null}
                </ul>
              ) : null}
              {previewRows.length > 0 ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-white/70">
                    Preview: <strong>{previewRows.length}</strong> row
                    {previewRows.length === 1 ? "" : "s"} (showing first 20)
                  </p>
                  <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
                    <table className="min-w-full text-left text-xs text-white/80">
                      <thead className="sticky top-0 bg-[#0a1628]">
                        <tr className="border-b border-white/10">
                          <th className="p-2">Date</th>
                          <th className="p-2">Job</th>
                          <th className="p-2">Crew</th>
                          <th className="p-2">In</th>
                          <th className="p-2">Out</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(0, 20).map((r, i) => (
                          <tr
                            key={i}
                            className="border-b border-white/5 odd:bg-white/[0.02]"
                          >
                            <td className="p-2 font-mono">{r.log_date}</td>
                            <td className="p-2">{r.job_name ?? "—"}</td>
                            <td className="p-2">{r.crew_user ?? "—"}</td>
                            <td className="p-2 font-mono">
                              {timeInputValue(r.check_in)}
                            </td>
                            <td className="p-2 font-mono">
                              {timeInputValue(r.check_out)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => void runImport()}
                    className="btn-primary btn-h-11"
                  >
                    {importing ? "Importing…" : "Import to database"}
                  </button>
                </div>
              ) : csvText ? (
                <p className="mt-3 text-sm text-amber-200/80">
                  No valid rows parsed. Check the CSV has a header row and a date
                  column.
                </p>
              ) : null}
            </section>

            <section className="mt-10">
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">
                All logs
              </h2>
              {logs.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    icon={<span aria-hidden>📝</span>}
                    title="No daily logs yet"
                    description="Create a log from the job site or import a JobTread CSV below. Logs you add will show up in this list and on the work calendar."
                    actionLabel="New daily log"
                    actionHref="/jobs/daily-logs/new"
                  />
                </div>
              ) : null}
              {logs.length > 0 && filteredLogs.length === 0 ? (
                <div
                  className="mt-4 rounded-xl border border-amber-500/25 bg-amber-950/20 p-5"
                  role="status"
                >
                  <p className="text-sm text-amber-100">
                    No logs match your filters. Try clearing the job, date, or
                    search filters.
                  </p>
                </div>
              ) : null}
              {logs.length > 0 ? (
              <div className="mt-4 hidden lg:block overflow-x-auto rounded-xl border border-white/10">
                <table className="min-w-full text-left text-sm text-white/85">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.04]">
                      <th className="p-3">Date</th>
                      <th className="p-3">Job</th>
                      <th className="p-3">Crew</th>
                      <th className="p-3">Hours</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Materials</th>
                      <th className="p-3 w-[200px]">PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length > 0 && filteredLogs.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="p-8 text-center text-sm text-white/45"
                        >
                          No logs match the current filters.
                        </td>
                      </tr>
                    ) : null}
                    {filteredLogs.map((l) => {
                      const h = hoursWorked(l.check_in, l.check_out);
                      const mu = extractMaterialLines(l.materials_used);
                      return (
                        <tr
                          key={l.id}
                          className="border-b border-white/5 hover:bg-white/[0.03]"
                        >
                          <td className="p-3 font-mono text-white/70">
                            {l.log_date}
                          </td>
                          <td className="p-3">
                            {l.job_id ? (
                              <Link
                                href={`/jobs/${l.job_id}`}
                                className="text-[#E8C84A] hover:underline"
                              >
                                {l.job_name ?? "View job"}
                              </Link>
                            ) : (
                              l.job_name ?? "—"
                            )}
                          </td>
                          <td className="p-3">{l.crew_user ?? "—"}</td>
                          <td className="p-3 font-mono text-[#E8C84A]">
                            {h != null ? `${h}h` : "—"}
                          </td>
                          <td className="p-3 text-white/60">
                            {l.job_status ?? "—"}
                          </td>
                          <td className="max-w-xs truncate p-3 text-xs text-white/50">
                            {mu.slice(0, 3).join(" · ")}
                            {mu.length > 3 ? "…" : ""}
                          </td>
                          <td className="p-2 align-top">
                            <DailyLogPdfActions
                              logId={l.id}
                              logDate={l.log_date}
                              pdfStoragePath={l.pdf_storage_path ?? null}
                              compact
                              onPdfSaved={() => void load()}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              ) : null}
              {logs.length > 0 ? (
              <ul className="mt-4 space-y-3 lg:hidden">
                {logs.length > 0 && filteredLogs.length === 0 ? (
                  <li className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-white/50">
                    No logs match the current filters.
                  </li>
                ) : null}
                {filteredLogs.map((l) => {
                  const h = hoursWorked(l.check_in, l.check_out);
                  return (
                    <li
                      key={l.id}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-mono text-sm text-white/70">
                          {l.log_date}
                        </span>
                        {h != null ? (
                          <span className="text-sm text-[#E8C84A]">{h}h</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-white">
                        {l.job_id ? (
                          <Link
                            href={`/jobs/${l.job_id}`}
                            className="text-[#E8C84A] hover:underline"
                          >
                            {l.job_name ?? "Job"}
                          </Link>
                        ) : (
                          l.job_name ?? "—"
                        )}
                      </p>
                      <p className="mt-1 text-xs text-white/50">
                        {l.crew_user ?? "—"} · {l.job_status ?? ""}
                      </p>
                      <div className="mt-3 border-t border-white/10 pt-3">
                        <DailyLogPdfActions
                          logId={l.id}
                          logDate={l.log_date}
                          pdfStoragePath={l.pdf_storage_path ?? null}
                          onPdfSaved={() => void load()}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              ) : null}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
