"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  TimesheetTableSkeleton,
} from "@/components/app-polish";
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
import {
  punchInLocalYmd,
  workedHoursForPunchRow,
  type PunchRow,
} from "@/lib/team-clock-utils";
import { splitRegularOvertime } from "@/lib/time-punch-worked";
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

type TodayPunchRow = {
  id: string;
  employeeName: string;
  jobName: string;
  punchInLabel: string;
  hoursSoFarLabel: string;
  status: "working" | "lunch";
};

type CompareRow = {
  key: string;
  employeeId: string;
  employeeName: string;
  logDate: string;
  tsHours: number;
  punchHours: number;
  flag:
    | "match"
    | "hours_mismatch"
    | "ts_no_punch"
    | "punch_no_ts";
  timesheetRowIds: string[];
};

function laborHoursFromTimesheetRows(dayRows: TimesheetRow[]): number {
  let t = 0;
  for (const r of dayRows) {
    if (r.entry_type === "regular") {
      t += num(r.hours_worked) + num(r.overtime_hours);
    } else if (r.entry_type === "overtime") {
      t += num(r.hours_worked);
    }
  }
  return Math.round(t * 100) / 100;
}

function hasLaborTimesheetRow(dayRows: TimesheetRow[]): boolean {
  return dayRows.some((r) => {
    if (r.entry_type === "regular") {
      return num(r.hours_worked) + num(r.overtime_hours) > 0.005;
    }
    if (r.entry_type === "overtime") {
      return num(r.hours_worked) > 0.005;
    }
    return false;
  });
}

function appendTimesheetNote(existing: string | null, line: string): string {
  const e = (existing ?? "").trim();
  const stamp = new Date().toISOString().slice(0, 19);
  const tagged = `[${stamp}] ${line.trim()}`;
  const next = e ? `${e}\n${tagged}` : tagged;
  return next.slice(0, 8000);
}

export function TimesheetsClient() {
  const router = useRouter();
  const { showToast } = useAppToast();
  const { profile, canManageTeamTime, role } = useUserRole();
  const [anchor, setAnchor] = useState(() => startOfWeekMonday(new Date()));
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [jobs, setJobs] = useState<JobOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<"week" | "today" | "compare">("week");
  const [todayRows, setTodayRows] = useState<TodayPunchRow[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [comparePunchRows, setComparePunchRows] = useState<PunchRow[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareNoteModal, setCompareNoteModal] = useState<{
    mode: "note" | "correction";
    row: CompareRow;
  } | null>(null);
  const [compareNoteDraft, setCompareNoteDraft] = useState("");
  const [compareNoteBusy, setCompareNoteBusy] = useState(false);

  const showTodayPunchesTab =
    role === "super_admin" || role === "admin" || role === "office_manager";

  const showCompareTab = role === "super_admin" || role === "admin";

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
      showToast({
        message: "Could not load job list for timesheets.",
        variant: "error",
      });
    }
  }, [showToast]);

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
      const msg =
        e instanceof Error ? e.message : "Could not load timesheets.";
      setError(msg);
      setRows([]);
      showToast({ message: msg, variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [activeFrom, activeTo, showToast]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadTodayPunches = useCallback(async () => {
    setTodayLoading(true);
    setTodayError(null);
    try {
      const r = await fetch("/api/time-clock/today", { credentials: "include" });
      const j = (await r.json()) as {
        punches?: TodayPunchRow[];
        error?: string;
      };
      if (!r.ok) {
        const msg = j.error ?? "Could not load today’s punches.";
        setTodayError(msg);
        setTodayRows([]);
        showToast({ message: msg, variant: "error" });
        return;
      }
      setTodayRows(j.punches ?? []);
    } catch {
      const msg = "Could not load today’s punches.";
      setTodayError(msg);
      setTodayRows([]);
      showToast({ message: msg, variant: "error" });
    } finally {
      setTodayLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (mainTab === "today" && showTodayPunchesTab) void loadTodayPunches();
  }, [mainTab, showTodayPunchesTab, loadTodayPunches]);

  useEffect(() => {
    if (mainTab !== "today" || !showTodayPunchesTab) return;
    const id = window.setInterval(() => void loadTodayPunches(), 45000);
    return () => window.clearInterval(id);
  }, [mainTab, showTodayPunchesTab, loadTodayPunches]);

  const loadComparePunches = useCallback(async () => {
    setCompareLoading(true);
    try {
      const sb = createBrowserClient();
      const start = new Date(activeFrom + "T00:00:00");
      const endEx = new Date(activeTo + "T00:00:00");
      endEx.setDate(endEx.getDate() + 1);
      const { data, error: qe } = await sb
        .from("time_punches")
        .select(
          "id,employee_id,job_name,punch_in_at,punch_out_at,on_lunch,lunch_start_at,total_lunch_ms",
        )
        .gte("punch_in_at", start.toISOString())
        .lt("punch_in_at", endEx.toISOString());
      if (qe) throw qe;
      setComparePunchRows((data ?? []) as PunchRow[]);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Could not load punches for compare.";
      showToast({ message: msg, variant: "error" });
      setComparePunchRows([]);
    } finally {
      setCompareLoading(false);
    }
  }, [activeFrom, activeTo, showToast]);

  useEffect(() => {
    if (mainTab !== "compare" || !showCompareTab) return;
    void loadComparePunches();
    const id = window.setInterval(() => void loadComparePunches(), 30000);
    return () => window.clearInterval(id);
  }, [mainTab, showCompareTab, loadComparePunches]);

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

  const compareRows = useMemo((): CompareRow[] => {
    if (!showCompareTab) return [];
    const timesheetByKey = new Map<string, TimesheetRow[]>();
    for (const r of rows) {
      if (r.log_date < activeFrom || r.log_date > activeTo) continue;
      const eid = r.employee_id?.trim();
      if (!eid) continue;
      const k = `${eid}|${r.log_date}`;
      if (!timesheetByKey.has(k)) timesheetByKey.set(k, []);
      timesheetByKey.get(k)!.push(r);
    }

    const punchByKey = new Map<string, number>();
    const nowMs = Date.now();
    for (const p of comparePunchRows) {
      const ymd = punchInLocalYmd(p.punch_in_at);
      if (ymd < activeFrom || ymd > activeTo) continue;
      const k = `${p.employee_id}|${ymd}`;
      const add = workedHoursForPunchRow(p, nowMs);
      punchByKey.set(k, Math.round(((punchByKey.get(k) ?? 0) + add) * 100) / 100);
    }

    const keys = new Set<string>([
      ...timesheetByKey.keys(),
      ...punchByKey.keys(),
    ]);
    const out: CompareRow[] = [];
    for (const key of keys) {
      const [employeeId, logDate] = key.split("|");
      if (!employeeId || !logDate) continue;
      const dayRows = timesheetByKey.get(key) ?? [];
      const tsHours = laborHoursFromTimesheetRows(dayRows);
      const punchHours = punchByKey.get(key) ?? 0;
      const tsLabor = hasLaborTimesheetRow(dayRows);
      const punchLabor = punchHours > 0.05;
      const employeeName =
        dayRows[0]?.employee_name?.trim() ||
        rows.find((x) => x.employee_id === employeeId)?.employee_name?.trim() ||
        employeeId.slice(0, 8);

      let flag: CompareRow["flag"] = "match";
      if (tsLabor && !punchLabor) flag = "ts_no_punch";
      else if (punchLabor && !tsLabor) flag = "punch_no_ts";
      else if (tsLabor && punchLabor && Math.abs(tsHours - punchHours) > 0.25) {
        flag = "hours_mismatch";
      }

      out.push({
        key,
        employeeId,
        employeeName,
        logDate,
        tsHours,
        punchHours,
        flag,
        timesheetRowIds: dayRows.map((r) => r.id),
      });
    }
    out.sort((a, b) => {
      if (a.logDate !== b.logDate) return a.logDate.localeCompare(b.logDate);
      return a.employeeName.localeCompare(b.employeeName);
    });
    return out;
  }, [rows, comparePunchRows, activeFrom, activeTo, showCompareTab]);

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

  const acceptCompareTimesheet = async (cr: CompareRow) => {
    if (cr.timesheetRowIds.length === 0) return;
    const sb = createBrowserClient();
    const {
      data: { session },
    } = await sb.auth.getSession();
    const uid = session?.user?.id ?? null;
    const at = new Date().toISOString();
    const { error } = await sb
      .from("timesheets")
      .update({
        status: "approved",
        approved_by: uid,
        approved_at: at,
      })
      .in("id", cr.timesheetRowIds);
    if (error) {
      showToast({ message: error.message, variant: "error" });
      return;
    }
    showToast({ message: "Timesheet rows approved.", variant: "success" });
    void load();
  };

  const usePunchRecordForCompare = async (cr: CompareRow) => {
    const punchH = cr.punchHours;
    const { regular, overtime } = splitRegularOvertime(punchH);
    const dayRows = rows.filter((r) => cr.timesheetRowIds.includes(r.id));
    const regularRows = dayRows.filter((r) => r.entry_type === "regular");
    const sb = createBrowserClient();
    if (regularRows.length >= 1) {
      try {
        const { error: u1 } = await sb
          .from("timesheets")
          .update({
            hours_worked: regular,
            overtime_hours: overtime,
          })
          .eq("id", regularRows[0].id);
        if (u1) throw u1;
        for (let i = 1; i < regularRows.length; i++) {
          const { error: ue } = await sb
            .from("timesheets")
            .update({ hours_worked: 0, overtime_hours: 0 })
            .eq("id", regularRows[i].id);
          if (ue) throw ue;
        }
        showToast({
          message: "Regular rows updated from punch totals.",
          variant: "success",
        });
        void load();
      } catch (e) {
        showToast({
          message: e instanceof Error ? e.message : "Update failed.",
          variant: "error",
        });
      }
      return;
    }
    const {
      data: { session },
    } = await sb.auth.getSession();
    try {
      const nameFromRows = rows.find(
        (x) => x.employee_id === cr.employeeId,
      )?.employee_name;
      const { error: ie } = await sb.from("timesheets").insert({
        employee_id: cr.employeeId,
        employee_name:
          nameFromRows ??
          profile?.full_name ??
          profile?.email ??
          session?.user?.email ??
          null,
        log_date: cr.logDate,
        entry_type: "regular",
        status: "pending",
        hours_worked: regular,
        overtime_hours: overtime,
        daily_log_id: null,
      });
      if (ie) throw ie;
      showToast({
        message: "Created timesheet row from punch hours.",
        variant: "success",
      });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Insert failed.",
        variant: "error",
      });
    }
  };

  const submitCompareNoteModal = async () => {
    if (!compareNoteModal || !compareNoteDraft.trim()) {
      showToast({ message: "Note text is required.", variant: "error" });
      return;
    }
    if (compareNoteModal.row.timesheetRowIds.length === 0) {
      showToast({
        message: "No timesheet row for this date — add a row first.",
        variant: "error",
      });
      return;
    }
    setCompareNoteBusy(true);
    try {
      const sb = createBrowserClient();
      const line =
        compareNoteModal.mode === "correction"
          ? `Correction requested: ${compareNoteDraft.trim()}`
          : `Compare note: ${compareNoteDraft.trim()}`;
      for (const id of compareNoteModal.row.timesheetRowIds) {
        const r = rows.find((x) => x.id === id);
        if (!r) continue;
        const patch: Partial<TimesheetRow> = {
          notes: appendTimesheetNote(r.notes, line),
        };
        if (compareNoteModal.mode === "correction") {
          patch.status = "pending";
          patch.approved_by = null;
          patch.approved_at = null;
        }
        const { error: ue } = await sb.from("timesheets").update(patch).eq("id", id);
        if (ue) throw ue;
      }
      showToast({ message: "Notes saved.", variant: "success" });
      setCompareNoteModal(null);
      setCompareNoteDraft("");
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Update failed.",
        variant: "error",
      });
    } finally {
      setCompareNoteBusy(false);
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
          {showTodayPunchesTab || showCompareTab ? (
            <div className="mt-4 flex flex-wrap gap-2 border-b border-white/10 pb-1">
              <button
                type="button"
                onClick={() => setMainTab("week")}
                className={[
                  "rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors",
                  mainTab === "week"
                    ? "bg-[#E8C84A]/20 text-[#E8C84A]"
                    : "text-white/55 hover:bg-white/5 hover:text-white/85",
                ].join(" ")}
              >
                Weekly timesheets
              </button>
              {showTodayPunchesTab ? (
                <button
                  type="button"
                  onClick={() => setMainTab("today")}
                  className={[
                    "rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors",
                    mainTab === "today"
                      ? "bg-[#E8C84A]/20 text-[#E8C84A]"
                      : "text-white/55 hover:bg-white/5 hover:text-white/85",
                  ].join(" ")}
                >
                  Today&apos;s Punches
                </button>
              ) : null}
              {showCompareTab ? (
                <button
                  type="button"
                  onClick={() => setMainTab("compare")}
                  className={[
                    "rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors",
                    mainTab === "compare"
                      ? "bg-[#E8C84A]/20 text-[#E8C84A]"
                      : "text-white/55 hover:bg-white/5 hover:text-white/85",
                  ].join(" ")}
                >
                  Compare
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {mainTab === "today" && showTodayPunchesTab ? (
          <section className="mt-8 print:hidden">
            <h2 className="text-sm font-bold uppercase tracking-wide text-white/55">
              Active punches right now
            </h2>
            <p className="mt-1 text-xs text-white/40">
              Anyone currently punched in (not including completed shifts today).
            </p>
            {todayLoading ? (
              <div className="mt-4">
                <TimesheetTableSkeleton />
              </div>
            ) : todayError ? (
              <p className="mt-4 text-sm text-red-300" role="alert">
                {todayError}
              </p>
            ) : todayRows.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={<span aria-hidden>🕐</span>}
                  title="No active punches"
                  description="Nobody is clocked in right now. When team members punch in from the field, they will appear here."
                  actionLabel="Open field punch"
                  actionHref="/field"
                />
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm text-white/88">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.06] text-[11px] font-bold uppercase tracking-wide text-[#E8C84A]">
                      <th className="px-3 py-3">Employee</th>
                      <th className="px-3 py-3">Job</th>
                      <th className="px-3 py-3">Punched in</th>
                      <th className="px-3 py-3">Hours so far</th>
                      <th className="px-3 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayRows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-white/8 odd:bg-white/[0.02] cursor-pointer hover:bg-white/[0.05] transition-colors"
                        onClick={() => router.push(`/team-clock`)}
                      >
                        <td className="px-3 py-3 font-medium">{row.employeeName}</td>
                        <td className="max-w-[14rem] truncate px-3 py-3 text-white/75">
                          {row.jobName}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs tabular-nums">
                          {row.punchInLabel}
                        </td>
                        <td className="px-3 py-3 font-mono tabular-nums text-[#E8C84A]">
                          {row.hoursSoFarLabel}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={
                              row.status === "lunch"
                                ? "rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-100"
                                : "rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-100"
                            }
                          >
                            {row.status === "lunch" ? "Lunch" : "Working"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button
              type="button"
              onClick={() => void loadTodayPunches()}
              className="btn-secondary btn-h-11 mt-4"
            >
              Refresh
            </button>
          </section>
        ) : null}

        {mainTab === "compare" && showCompareTab ? (
          <section className="mt-8 print:hidden">
            <h2 className="text-sm font-bold uppercase tracking-wide text-white/55">
              Timesheet vs punch clock
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-white/55">
              Left column is labor hours from submitted timesheet rows (regular +
              overtime). Right column is net hours from punch records for the same
              calendar day. Rows refresh every 30 seconds while this tab is open.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
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
              <button
                type="button"
                onClick={() => {
                  void load();
                  void loadComparePunches();
                }}
                className="btn-secondary btn-h-11"
              >
                Refresh
              </button>
            </div>
            {compareLoading ? (
              <div className="mt-6">
                <TimesheetTableSkeleton />
              </div>
            ) : compareRows.length === 0 ? (
              <p className="mt-6 text-sm text-white/50">
                No timesheet or punch data in this range for comparison.
              </p>
            ) : (
              <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[960px] border-collapse text-left text-sm text-white/88">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.06] text-[11px] font-bold uppercase tracking-wide text-[#E8C84A]">
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Employee</th>
                      <th className="px-3 py-3 text-right">Timesheet hrs</th>
                      <th className="px-3 py-3 text-right">Punch hrs</th>
                      <th className="px-3 py-3">Flag</th>
                      <th className="px-3 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((cr) => (
                      <tr
                        key={cr.key}
                        className="border-b border-white/8 odd:bg-white/[0.02]"
                      >
                        <td className="px-3 py-3 font-mono text-xs">
                          {cr.logDate}
                        </td>
                        <td className="px-3 py-3 font-medium">
                          {cr.employeeName}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-[#E8C84A]">
                          {cr.tsHours.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {cr.punchHours.toFixed(2)}
                        </td>
                        <td className="px-3 py-3">
                          {cr.flag === "match" ? (
                            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-200">
                              Match
                            </span>
                          ) : null}
                          {cr.flag === "hours_mismatch" ? (
                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-100">
                              Hours differ
                            </span>
                          ) : null}
                          {cr.flag === "ts_no_punch" ? (
                            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-100">
                              TS, no punch
                            </span>
                          ) : null}
                          {cr.flag === "punch_no_ts" ? (
                            <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-100">
                              Punch, no TS
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex max-w-[22rem] flex-wrap gap-1">
                            {cr.timesheetRowIds.length > 0 ? (
                              <button
                                type="button"
                                className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500"
                                onClick={() => void acceptCompareTimesheet(cr)}
                              >
                                Accept TS
                              </button>
                            ) : null}
                            {cr.punchHours > 0.05 ? (
                              <button
                                type="button"
                                className="rounded bg-[#E8C84A] px-2 py-1 text-[10px] font-semibold text-[#0a1628] hover:bg-[#f0d56e]"
                                onClick={() => void usePunchRecordForCompare(cr)}
                              >
                                Use punch
                              </button>
                            ) : null}
                            {cr.timesheetRowIds.length > 0 ? (
                              <button
                                type="button"
                                className="rounded border border-amber-400/50 px-2 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/10"
                                onClick={() => {
                                  setCompareNoteDraft("");
                                  setCompareNoteModal({
                                    mode: "correction",
                                    row: cr,
                                  });
                                }}
                              >
                                Request correction
                              </button>
                            ) : null}
                            {cr.timesheetRowIds.length > 0 ? (
                              <button
                                type="button"
                                className="rounded border border-white/25 px-2 py-1 text-[10px] font-semibold text-white/85 hover:bg-white/10"
                                onClick={() => {
                                  setCompareNoteDraft("");
                                  setCompareNoteModal({
                                    mode: "note",
                                    row: cr,
                                  });
                                }}
                              >
                                Add note
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {mainTab === "week" ? (
          loading ? (
          <div className="print:hidden">
            <TimesheetTableSkeleton />
          </div>
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

            {rows.length === 0 ? (
              <div className="mt-8 print:hidden">
                <EmptyState
                  icon={<span aria-hidden>📋</span>}
                  title="No timesheets in this range"
                  description="There are no timesheet rows for the dates you selected. Managers can add a manual row, or entries will appear when team time is approved and synced."
                  actionLabel={
                    canManageTeamTime ? "Add manual row" : undefined
                  }
                  onAction={
                    canManageTeamTime
                      ? () => void addBlankRow()
                      : undefined
                  }
                />
              </div>
            ) : null}

            {rows.length > 0 && filtered.length === 0 ? (
              <div
                className="mt-8 rounded-xl border border-amber-500/25 bg-amber-950/20 p-5 print:hidden"
                role="status"
              >
                <p className="text-sm font-medium text-amber-100">
                  No timesheets match the employee filter.
                </p>
                <button
                  type="button"
                  className="btn-secondary btn-h-11 mt-3"
                  onClick={() => setEmployeeFilter("")}
                >
                  Show all employees
                </button>
              </div>
            ) : null}

            <section
              className={`mt-8 print:mt-0 ${rows.length === 0 ? "hidden print:hidden" : ""}`}
              aria-hidden={rows.length === 0}
            >
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/55 print:text-black">
                Weekly summary
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {summaryByEmployee.length === 0 ? (
                  <p className="text-sm text-white/45">
                    No rows match the current filter.
                  </p>
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
              className={`mt-10 overflow-x-auto rounded-xl border border-white/10 print:border-0 ${rows.length === 0 ? "hidden print:hidden" : ""}`}
              aria-hidden={rows.length === 0}
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
                  {filtered.length === 0 && rows.length > 0 ? (
                    <tr className="print:hidden">
                      <td
                        colSpan={canManageTeamTime ? 10 : 9}
                        className="p-8 text-center text-sm text-white/50"
                      >
                        No rows match the employee filter — adjust the filter
                        above.
                      </td>
                    </tr>
                  ) : null}
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
        )
        ) : null}

        {compareNoteModal ? (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="presentation"
            onClick={(ev) => {
              if (ev.target === ev.currentTarget && !compareNoteBusy) {
                setCompareNoteModal(null);
                setCompareNoteDraft("");
              }
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0a1628] p-5 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="compare-note-title"
              onClick={(ev) => ev.stopPropagation()}
            >
              <h2
                id="compare-note-title"
                className="text-lg font-semibold text-white"
              >
                {compareNoteModal.mode === "correction"
                  ? "Request correction"
                  : "Add compare note"}
              </h2>
              <p className="mt-2 text-sm text-white/55">
                {compareNoteModal.mode === "correction"
                  ? "Appends to every timesheet row for this employee and date, and sets status back to pending."
                  : "Appends an audited note to every timesheet row for this employee and date."}
              </p>
              <label className="mt-4 block text-xs text-white/45">
                Note
                <textarea
                  className="app-input mt-1 min-h-[6rem] w-full resize-y"
                  value={compareNoteDraft}
                  onChange={(e) => setCompareNoteDraft(e.target.value)}
                  placeholder="Required"
                />
              </label>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={compareNoteBusy}
                  className="btn-secondary btn-h-11"
                  onClick={() => {
                    setCompareNoteModal(null);
                    setCompareNoteDraft("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={compareNoteBusy}
                  className="btn-primary btn-h-11"
                  onClick={() => void submitCompareNoteModal()}
                >
                  {compareNoteBusy ? "Saving…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
