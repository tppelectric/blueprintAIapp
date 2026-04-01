"use client";

import Link from "next/link";
import { ReceiptCapture } from "@/components/receipt-capture";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UserRole } from "@/lib/user-roles";
import {
  formatDecimalHoursAsReadable,
  formatMsAsHms,
  formatWorkedMsForPunchTable,
  workedMsFromPunch,
} from "@/lib/time-punch-worked";
import {
  formatPunchGpsStatusLine,
  parsePunchLocationJson,
  teamClockGpsDotForOpenPunch,
} from "@/lib/punch-gps";
import { requestBrowserPunchLocation } from "@/lib/request-browser-punch-location";

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localDayIsoRange(): { from: string; to: string } {
  const d = new Date();
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
  return { from: start.toISOString(), to: end.toISOString() };
}

function isoRangeFromYmd(startYmd: string, endYmdInclusive: string): {
  from: string;
  to: string;
} | null {
  const p1 = startYmd.split("-").map(Number);
  const p2 = endYmdInclusive.split("-").map(Number);
  if (p1.length !== 3 || p2.length !== 3) return null;
  const [y1, m1, d1] = p1;
  const [y2, m2, d2] = p2;
  if (
    [y1, m1, d1, y2, m2, d2].some(
      (n) => typeof n !== "number" || Number.isNaN(n),
    )
  ) {
    return null;
  }
  const from = new Date(y1!, m1! - 1, d1!, 0, 0, 0, 0);
  const endExclusive = new Date(y2!, m2! - 1, d2!, 0, 0, 0, 0);
  endExclusive.setDate(endExclusive.getDate() + 1);
  if (endExclusive.getTime() <= from.getTime()) return null;
  return { from: from.toISOString(), to: endExclusive.toISOString() };
}

type ActivePunch = {
  id: string;
  job_id: string | null;
  job_name: string | null;
  punch_in_at: string;
  notes: string | null;
  on_lunch: boolean;
  lunch_start_at: string | null;
  total_lunch_ms: number;
  punch_in_location?: Record<string, unknown> | null;
  lunch_start_location?: Record<string, unknown> | null;
  gps_override_at?: string | null;
  gps_location_flagged?: boolean;
  is_manual_entry?: boolean;
  manual_entry_by_name?: string | null;
  manual_entry_at?: string | null;
  manual_entry_note?: string | null;
};

type JobOpt = { id: string; job_name: string; job_number: string };

type DayPunchRow = {
  id: string;
  timeIn: string;
  timeOut: string;
  hours: number;
  hoursLabel: string;
  jobName: string;
  lunchMinutes: number;
  isOpen: boolean;
  runningTotalHours: number;
  runningTotalLabel?: string;
};

type TeamOnSiteRow = {
  id: string;
  employeeId: string;
  fullName: string;
  jobName: string | null;
  punchInAt: string;
  onLunch: boolean;
  totalLunchMs: number;
  lunchStartAt: string | null;
  punchInLocation?: Record<string, unknown> | null;
  lunchStartLocation?: Record<string, unknown> | null;
  gpsOverrideAt?: string | null;
  isManualEntry?: boolean;
  manualEntryByName?: string | null;
};

type DayTotals = {
  grossHours: number;
  totalWorkedHours: number;
  totalLunchMinutes: number;
  netHours: number;
  overtimeHours: number;
  runningTotalHours: number;
};

type AuditPunch = {
  id: string;
  employeeId: string;
  employeeName: string;
  jobName: string;
  punchInAt: string;
  punchOutAt: string | null;
  workedHours: number;
  lunchMinutes: number;
  approvalStatus: string | null;
  discrepancyFlag: boolean;
  discrepancyNote: string | null;
  isOpen: boolean;
};

type JobSummaryRow = {
  jobId: string | null;
  jobName: string;
  hoursInRange: number;
  currentlyOnSite: { employeeId: string; name: string }[];
};

type PunchSummary = {
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  lunchMinutes: number;
  jobName: string;
  jobId: string | null;
  logDate: string;
  checkIn: string;
  checkOut: string;
};

function fieldGpsTierClass(
  tier: ReturnType<typeof teamClockGpsDotForOpenPunch>,
): string {
  if (tier === "green") return "text-emerald-200/95";
  if (tier === "yellow") return "text-amber-200/95";
  return "text-red-200/90";
}

function activeSessionGpsDisplay(session: ActivePunch): {
  line: string;
  lineClass: string;
  overrideNote: boolean;
} {
  const locJson =
    session.on_lunch && session.lunch_start_location
      ? session.lunch_start_location
      : session.punch_in_location;
  const loc = parsePunchLocationJson(locJson);
  const tier = teamClockGpsDotForOpenPunch({
    punch_in_location: session.punch_in_location,
    lunch_start_location: session.lunch_start_location,
    gps_override_at: session.gps_override_at ?? null,
    on_lunch: session.on_lunch,
  });
  return {
    line: formatPunchGpsStatusLine(loc),
    lineClass: fieldGpsTierClass(tier),
    overrideNote: Boolean(session.gps_override_at),
  };
}

export function FieldClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qpJob = searchParams.get("jobId")?.trim() ?? "";

  const [role, setRole] = useState<UserRole | null>(null);
  const [fieldTab, setFieldTab] = useState<"clock" | "audit">("clock");
  const [showPunch, setShowPunch] = useState(false);
  const [activeSession, setActiveSession] = useState<ActivePunch | null>(null);
  const [jobs, setJobs] = useState<JobOpt[]>([]);
  const [jobId, setJobId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [clockTick, setClockTick] = useState(0);
  const [teamActive, setTeamActive] = useState<TeamOnSiteRow[] | null>(null);
  const [lastLunchMinutes, setLastLunchMinutes] = useState<number | null>(null);
  const [punchSummary, setPunchSummary] = useState<PunchSummary | null>(null);
  const [dayPunches, setDayPunches] = useState<DayPunchRow[] | null>(null);
  const [dayTotals, setDayTotals] = useState<DayTotals | null>(null);
  const [auditPunches, setAuditPunches] = useState<AuditPunch[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditMsg, setAuditMsg] = useState<string | null>(null);
  const [auditBusyId, setAuditBusyId] = useState<string | null>(null);
  const [jobsToday, setJobsToday] = useState<JobSummaryRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const todayYmd = formatYmd(new Date());
  const [auditFrom, setAuditFrom] = useState(() => {
    const x = new Date();
    x.setDate(x.getDate() - 6);
    return formatYmd(x);
  });
  const [auditTo, setAuditTo] = useState(todayYmd);
  const notesBaseline = useRef("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);
  const jobSearchRef = useRef<HTMLDivElement>(null);

  const ingestClockResponse = useCallback(
    (j: {
      role?: UserRole | null;
      showPunchInterface?: boolean;
      activeSession?: ActivePunch | null;
      teamActive?: TeamOnSiteRow[] | null;
      jobs?: JobOpt[];
      dayPunches?: DayPunchRow[] | null;
      dayTotals?: DayTotals | null;
    }) => {
      setRole((j.role ?? null) as UserRole | null);
      setShowPunch(Boolean(j.showPunchInterface));
      const s = j.activeSession ?? null;
      setActiveSession(s);
      if (s) {
        const n = s.notes ?? "";
        setNotes(n);
        notesBaseline.current = n;
      } else {
        setNotes("");
        notesBaseline.current = "";
        setLastLunchMinutes(null);
      }
      setJobs(j.jobs ?? []);
      setDayPunches(j.dayPunches ?? null);
      setDayTotals(j.dayTotals ?? null);
      setTeamActive(Array.isArray(j.teamActive) ? j.teamActive : null);
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const { from, to } = localDayIsoRange();
      const r = await fetch(
        `/api/time-clock?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { credentials: "include" },
      );
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      const j = (await r.json()) as {
        role?: UserRole | null;
        showPunchInterface?: boolean;
        activeSession?: ActivePunch | null;
        teamActive?: TeamOnSiteRow[] | null;
        jobs?: JobOpt[];
        dayPunches?: DayPunchRow[] | null;
        dayTotals?: DayTotals | null;
        error?: string;
      };
      if (!r.ok || j.error) {
        setMsg(j.error ?? "Could not load time clock.");
        return;
      }
      ingestClockResponse(j);
    } catch {
      setMsg("Could not load time clock.");
    } finally {
      setLoading(false);
    }
  }, [ingestClockResponse]);

  const isCompanyAdmin = role === "admin" || role === "super_admin";

  const silentRefreshTeam = useCallback(async () => {
    if (role !== "admin" && role !== "super_admin") return;
    try {
      const { from, to } = localDayIsoRange();
      const r = await fetch(
        `/api/time-clock?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { credentials: "include" },
      );
      if (!r.ok) return;
      const j = (await r.json()) as {
        teamActive?: TeamOnSiteRow[] | null;
        error?: string;
      };
      if (j.error) return;
      setTeamActive(Array.isArray(j.teamActive) ? j.teamActive : null);
    } catch {
      /* ignore */
    }
  }, [role]);

  const loadAuditAndJobs = useCallback(async () => {
    if (!isCompanyAdmin) return;
    const range = isoRangeFromYmd(auditFrom, auditTo);
    if (!range) {
      setAuditMsg("Invalid date range.");
      return;
    }
    setAuditMsg(null);
    setAuditLoading(true);
    setJobsLoading(true);
    try {
      const q = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
      const [ra, rj] = await Promise.all([
        fetch(`/api/time-clock/audit?${q}`, { credentials: "include" }),
        fetch(
          `/api/time-clock/jobs-summary?${q}`,
          { credentials: "include" },
        ),
      ]);
      if (ra.status === 403) {
        setAuditMsg("You do not have access to audit.");
        setAuditPunches([]);
        setJobsToday([]);
        return;
      }
      const ja = (await ra.json()) as {
        punches?: AuditPunch[];
        error?: string;
      };
      const jj = (await rj.json()) as {
        jobs?: JobSummaryRow[];
        error?: string;
      };
      if (!ra.ok) {
        setAuditMsg(ja.error ?? "Could not load audit.");
        setAuditPunches([]);
      } else {
        setAuditPunches(ja.punches ?? []);
      }
      if (!rj.ok) {
        setJobsToday([]);
      } else {
        setJobsToday(jj.jobs ?? []);
      }
    } catch {
      setAuditMsg("Could not load audit.");
      setAuditPunches([]);
      setJobsToday([]);
    } finally {
      setAuditLoading(false);
      setJobsLoading(false);
    }
  }, [auditFrom, auditTo, isCompanyAdmin]);

  useEffect(() => {
    if (fieldTab !== "audit" || !isCompanyAdmin) return;
    void loadAuditAndJobs();
  }, [fieldTab, isCompanyAdmin, loadAuditAndJobs]);

  const patchAudit = useCallback(
    async (
      punchId: string,
      patch: {
        approvalStatus?: "pending" | "approved" | "rejected";
        discrepancyFlag?: boolean;
        discrepancyNote?: string | null;
      },
    ) => {
      setAuditBusyId(punchId);
      setAuditMsg(null);
      try {
        const r = await fetch("/api/time-clock/audit", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ punchId, ...patch }),
        });
        const j = (await r.json()) as { error?: string };
        if (!r.ok) {
          setAuditMsg(j.error ?? "Update failed.");
          return;
        }
        await loadAuditAndJobs();
      } catch {
        setAuditMsg("Update failed.");
      } finally {
        setAuditBusyId(null);
      }
    },
    [loadAuditAndJobs],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeSession) setReceiptOpen(false);
  }, [activeSession]);

  useEffect(() => {
    if (fieldTab !== "clock" || !showPunch) return;
    const needLiveClock =
      activeSession != null ||
      role === "admin" ||
      role === "super_admin";
    if (!needLiveClock) return;
    const id = window.setInterval(() => setClockTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [fieldTab, showPunch, activeSession?.id, role]);

  useEffect(() => {
    if (fieldTab !== "clock" || !showPunch) return;
    if (role !== "admin" && role !== "super_admin") return;
    void silentRefreshTeam();
    const id = window.setInterval(() => void silentRefreshTeam(), 30000);
    return () => window.clearInterval(id);
  }, [fieldTab, showPunch, role, silentRefreshTeam]);

  useEffect(() => {
    if (!jobs.length) return;
    if (qpJob && jobs.some((j) => j.id === qpJob)) {
      setJobId(qpJob);
      return;
    }
    setJobId((prev) =>
      prev && jobs.some((j) => j.id === prev) ? prev : jobs[0]!.id,
    );
  }, [qpJob, jobs]);

  const filteredJobOpts = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      (j) =>
        j.job_name?.toLowerCase().includes(q) ||
        j.job_number?.toLowerCase().includes(q),
    );
  }, [jobs, jobSearch]);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === jobId) ?? null,
    [jobs, jobId],
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        jobSearchRef.current &&
        !jobSearchRef.current.contains(e.target as Node)
      ) {
        setJobDropdownOpen(false);
        setJobSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const postJson = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/time-clock", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as {
        error?: string;
        summary?: PunchSummary;
        lastLunchMinutes?: number;
      };
      if (!r.ok) {
        setMsg(j.error ?? "Request failed.");
        return j;
      }
      return j;
    } catch {
      setMsg("Request failed.");
      return { error: "failed" };
    } finally {
      setBusy(false);
    }
  };

  const postPunchWithGps = async (body: Record<string, unknown>) => {
    const location = await requestBrowserPunchLocation();
    return postJson({
      ...body,
      ...(location ? { location } : {}),
    });
  };

  useEffect(() => {
    if (!activeSession || notes === notesBaseline.current) return;
    const t = window.setTimeout(() => {
      void (async () => {
        const r = await fetch("/api/time-clock", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save_notes", notes }),
        });
        const j = (await r.json()) as { error?: string };
        if (r.ok && !j.error) notesBaseline.current = notes;
      })();
    }, 900);
    return () => window.clearTimeout(t);
  }, [notes, activeSession?.id]);

  const onPunchIn = async () => {
    if (!jobId) {
      setMsg("Choose a job.");
      return;
    }
    const j = await postPunchWithGps({
      action: "punch_in",
      jobId,
      notes: notes.trim() || undefined,
    });
    if (!j || "error" in j) return;
    await refresh();
  };

  const onPunchOut = async () => {
    if (!window.confirm("End your shift?")) return;
    const j = await postPunchWithGps({ action: "punch_out" });
    if (!j || !("summary" in j) || !j.summary) return;
    setPunchSummary(j.summary);
    setActiveSession(null);
    setNotes("");
  };

  const onStartLunch = async () => {
    const j = await postPunchWithGps({ action: "start_lunch" });
    if (!j || "error" in j) return;
    const nowIso = new Date().toISOString();
    setActiveSession((s) =>
      s ? { ...s, on_lunch: true, lunch_start_at: nowIso } : s,
    );
    void refresh();
  };

  const onEndLunch = async () => {
    const j = await postPunchWithGps({ action: "end_lunch" });
    if (!j || "error" in j) return;
    if (typeof j.lastLunchMinutes === "number") {
      setLastLunchMinutes(j.lastLunchMinutes);
    }
    setActiveSession((s) =>
      s ? { ...s, on_lunch: false, lunch_start_at: null } : s,
    );
    void refresh();
  };

  const nowLabel = new Date().toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[var(--surface-card)] px-4 py-8">
        <p className="text-center text-[var(--foreground-muted)]">Loading…</p>
      </div>
    );
  }

  if (punchSummary) {
    const dailyLogHref =
      punchSummary.jobId &&
      `/jobs/daily-logs/new?jobId=${encodeURIComponent(punchSummary.jobId)}&logDate=${encodeURIComponent(punchSummary.logDate)}&checkIn=${encodeURIComponent(punchSummary.checkIn)}&checkOut=${encodeURIComponent(punchSummary.checkOut)}`;
    return (
      <div className="min-h-[100dvh] bg-[var(--surface-card)] px-4 pb-10 pt-6">
        <div className="mx-auto max-w-md space-y-6">
          <h1 className="text-center text-xl font-bold text-[var(--foreground)]">
            Shift complete!
          </h1>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] p-5 text-center shadow-sm">
            <p className="text-lg font-semibold text-[#E8C84A]">
              Total: {formatDecimalHoursAsReadable(punchSummary.totalHours)}
              {punchSummary.overtimeHours > 0
                ? ` (${formatDecimalHoursAsReadable(punchSummary.overtimeHours)} OT)`
                : ""}
            </p>
            <p className="mt-2 text-sm text-[var(--foreground-muted)]">
              Job: {punchSummary.jobName}
            </p>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              Lunch: {punchSummary.lunchMinutes} min
            </p>
          </div>
          {dailyLogHref ? (
            <Link
              href={dailyLogHref}
              className="flex h-14 w-full items-center justify-center rounded-xl bg-[#E8C84A] text-base font-bold text-[#0a1628] shadow-md active:opacity-90"
            >
              Create Daily Log
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex h-14 w-full items-center justify-center rounded-xl border-2 border-[var(--border)] text-base font-semibold text-[var(--foreground)] active:bg-[var(--surface-elevated)]"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (!showPunch) {
    return (
      <div className="min-h-[100dvh] bg-[var(--surface-card)] px-4 py-10">
        <div className="mx-auto max-w-md">
          <h1 className="text-xl font-semibold text-[var(--foreground)]">
            Time clock
          </h1>
          <p className="mt-3 text-sm text-[var(--foreground-muted)]">
            Time clock access is not enabled for your account. Ask a super admin
            to turn on Time Clock Access.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block text-sm font-medium text-[#E8C84A]"
          >
            ← Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const workedMsLive =
    activeSession && !punchSummary
      ? (() => {
          void clockTick;
          return workedMsFromPunch(
            {
              punch_in_at: activeSession.punch_in_at,
              on_lunch: activeSession.on_lunch,
              lunch_start_at: activeSession.lunch_start_at,
              total_lunch_ms: activeSession.total_lunch_ms,
            },
            Date.now(),
          );
        })()
      : 0;
  const workedLabel =
    activeSession && !punchSummary ? formatMsAsHms(workedMsLive) : "";

  const punchedInLabel = activeSession
    ? new Date(activeSession.punch_in_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  let onLunchLiveMs = 0;
  if (activeSession?.on_lunch && activeSession.lunch_start_at) {
    void clockTick;
    const ls = new Date(activeSession.lunch_start_at).getTime();
    if (!Number.isNaN(ls)) {
      onLunchLiveMs = Math.max(0, Date.now() - ls);
    }
  }
  const onLunchLiveLabel = formatMsAsHms(onLunchLiveMs);

  const auditRange = isoRangeFromYmd(auditFrom, auditTo);
  const auditExportHref =
    auditRange != null
      ? `/api/time-clock/audit?from=${encodeURIComponent(auditRange.from)}&to=${encodeURIComponent(auditRange.to)}&format=csv`
      : null;

  function formatAuditTs(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="min-h-[100dvh] touch-manipulation bg-gradient-to-b from-[#0a1628] to-[#060d1a] px-4 pb-12 pt-4 text-white">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-[#E8C84A] active:opacity-80"
          >
            ← Dashboard
          </Link>
          <Link
            href="/receipts"
            className="text-sm font-medium text-white/80 underline decoration-white/30 underline-offset-2 hover:text-[#E8C84A]"
          >
            Receipts
          </Link>
          <span className="sr-only tabular-nums" aria-live="polite">
            {clockTick}
          </span>
        </header>

        {msg ? (
          <p
            className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-100"
            role="alert"
          >
            {msg}
          </p>
        ) : null}

        {isCompanyAdmin ? (
          <div className="flex rounded-xl border border-white/15 bg-[#071422] p-1">
            <button
              type="button"
              onClick={() => setFieldTab("clock")}
              className={
                fieldTab === "clock"
                  ? "flex-1 rounded-lg bg-[#E8C84A] py-2.5 text-sm font-bold text-[#0a1628]"
                  : "flex-1 rounded-lg py-2.5 text-sm font-medium text-white/70"
              }
            >
              Clock
            </button>
            <button
              type="button"
              onClick={() => setFieldTab("audit")}
              className={
                fieldTab === "audit"
                  ? "flex-1 rounded-lg bg-[#E8C84A] py-2.5 text-sm font-bold text-[#0a1628]"
                  : "flex-1 rounded-lg py-2.5 text-sm font-medium text-white/70"
              }
            >
              Audit
            </button>
          </div>
        ) : null}

        {fieldTab === "clock" ? (
          <>
            {dayTotals ? (
              <section className="rounded-2xl border border-white/15 bg-[#071422]/90 p-4 shadow-sm">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-white/50">
                  Today&apos;s summary
                </h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/70">Total hours worked</dt>
                    <dd className="font-semibold tabular-nums text-[#E8C84A]">
                      {formatDecimalHoursAsReadable(dayTotals.totalWorkedHours)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/70">Lunch taken</dt>
                    <dd className="tabular-nums text-white">
                      {dayTotals.totalLunchMinutes} min
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/70">Net hours</dt>
                    <dd className="tabular-nums text-white">
                      {formatDecimalHoursAsReadable(dayTotals.netHours)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/50">On-site (in→out)</dt>
                    <dd className="tabular-nums text-white/80">
                      {formatDecimalHoursAsReadable(dayTotals.grossHours)}
                    </dd>
                  </div>
                  {dayTotals.overtimeHours > 0 ? (
                    <div className="flex justify-between gap-4 border-t border-white/10 pt-2">
                      <dt className="text-amber-200/90">Overtime</dt>
                      <dd className="font-medium tabular-nums text-amber-200">
                        {formatDecimalHoursAsReadable(dayTotals.overtimeHours)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ) : null}

            {dayPunches && dayPunches.length > 0 ? (
              <section className="overflow-hidden rounded-2xl border border-white/15">
                <h2 className="bg-[#071422] px-3 py-2.5 text-sm font-semibold text-white/90">
                  Today&apos;s punches
                </h2>
                <div className="overflow-x-auto bg-[#060d18]">
                  <table className="w-full min-w-[480px] text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-white/55">
                        <th className="px-3 py-2 font-medium">In</th>
                        <th className="px-3 py-2 font-medium">Out</th>
                        <th className="px-3 py-2 font-medium">Hours</th>
                        <th className="px-3 py-2 font-medium">Job</th>
                        <th className="px-3 py-2 text-right font-medium">
                          Running
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayPunches.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-white/5 text-white/90"
                        >
                          <td className="px-3 py-2 tabular-nums">{p.timeIn}</td>
                          <td className="px-3 py-2 tabular-nums">
                            {p.timeOut}
                            {p.isOpen ? (
                              <span className="ml-1 text-emerald-300">●</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {p.hoursLabel}
                          </td>
                          <td className="max-w-[140px] truncate px-3 py-2">
                            {p.jobName}
                          </td>
                          <td className="px-3 py-2 text-right text-[#E8C84A]">
                            {p.runningTotalLabel ??
                              formatWorkedMsForPunchTable(
                                Math.round(p.runningTotalHours * 3600000),
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {dayTotals ? (
                  <p className="border-t border-white/10 bg-[#071422] px-3 py-2 text-right text-sm font-semibold text-[#E8C84A]">
                    Day total:{" "}
                    {formatWorkedMsForPunchTable(
                      Math.round(dayTotals.runningTotalHours * 3600000),
                    )}
                  </p>
                ) : null}
              </section>
            ) : dayPunches && dayPunches.length === 0 ? (
              <p className="text-center text-sm text-white/45">
                No punches yet today.
              </p>
            ) : null}

            {!activeSession ? (
              <>
                <section
                  className="rounded-2xl border border-white/15 bg-[#071422]/90 p-6 text-center shadow-sm"
                  aria-labelledby="field-not-punched-heading"
                >
                  <h2
                    id="field-not-punched-heading"
                    className="text-base font-semibold text-white"
                  >
                    You&apos;re not punched in
                  </h2>
                  <p className="mt-2 text-sm text-white/60">
                    Choose a job and tap Punch in when you arrive on site. Your
                    time appears on timesheets after you punch out.
                  </p>
                  <p className="mt-4 text-sm text-white/45">Current time</p>
                  <p className="mt-1 text-xl font-medium tabular-nums text-[#E8C84A]">
                    {nowLabel}
                  </p>
                </section>

                <div className="block text-sm font-medium text-white/90">
                  <span>Job</span>
                  <div className="relative mt-2" ref={jobSearchRef}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setJobDropdownOpen((o) => !o);
                        setJobSearch("");
                      }}
                      className="w-full rounded-xl border border-white/20 bg-[#071422] px-4 py-3.5 text-left text-base text-white disabled:opacity-50"
                    >
                      {selectedJob
                        ? `${selectedJob.job_number ? selectedJob.job_number + " · " : ""}${selectedJob.job_name || "Job"}`
                        : jobs.length === 0
                          ? "No jobs available"
                          : "Select a job…"}
                    </button>
                    {jobDropdownOpen ? (
                      <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-white/20 bg-[#071422] shadow-xl">
                        <div className="p-2">
                          <input
                            type="search"
                            autoFocus
                            className="w-full rounded-lg border border-white/20 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-[#E8C84A]/60"
                            placeholder="Search job name or number…"
                            value={jobSearch}
                            onChange={(e) => setJobSearch(e.target.value)}
                          />
                        </div>
                        <ul className="max-h-60 overflow-y-auto">
                          {filteredJobOpts.length === 0 ? (
                            <li className="px-4 py-3 text-sm text-white/50">
                              No jobs match
                            </li>
                          ) : (
                            filteredJobOpts.map((j) => (
                              <li key={j.id}>
                                <button
                                  type="button"
                                  className={`w-full px-4 py-3 text-left text-sm transition-colors hover:bg-white/[0.08] ${
                                    j.id === jobId
                                      ? "bg-[#E8C84A]/10 text-[#E8C84A]"
                                      : "text-white"
                                  }`}
                                  onClick={() => {
                                    setJobId(j.id);
                                    setJobDropdownOpen(false);
                                    setJobSearch("");
                                  }}
                                >
                                  <span className="font-medium">
                                    {j.job_number ? `${j.job_number} · ` : ""}
                                    {j.job_name || "Job"}
                                  </span>
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>

                <label className="block text-sm font-medium text-white/90">
                  Notes <span className="text-white/45">(optional)</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={busy}
                    rows={3}
                    placeholder="Optional note for this shift…"
                    className="mt-2 w-full resize-none rounded-xl border border-white/20 bg-[#071422] px-4 py-3 text-base text-white placeholder:text-white/35"
                  />
                </label>

                <p className="text-center text-xs text-white/45">
                  Location is requested when you punch (you can allow or deny;
                  punches are always saved).
                </p>
                <button
                  type="button"
                  disabled={busy || !jobId}
                  onClick={() => void onPunchIn()}
                  className="flex min-h-[3.5rem] w-full items-center justify-center rounded-2xl bg-emerald-500 text-lg font-bold text-white shadow-lg shadow-emerald-900/40 active:bg-emerald-400 disabled:opacity-40"
                >
                  PUNCH IN
                </button>
              </>
            ) : (
              <>
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-4 text-center">
                  <p className="text-lg font-bold tracking-wide text-emerald-200">
                    ON THE CLOCK ✅
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {activeSession.job_name?.trim() || "—"}
                  </p>
                  {(() => {
                    const g = activeSessionGpsDisplay(activeSession);
                    return (
                      <>
                        <p
                          className={`mt-1 text-xs font-medium leading-snug ${g.lineClass}`}
                        >
                          {g.line}
                        </p>
                        {g.overrideNote ? (
                          <p className="mt-0.5 text-[11px] text-emerald-200/75">
                            GPS override on file
                          </p>
                        ) : null}
                      </>
                    );
                  })()}
                  {activeSession.is_manual_entry &&
                  activeSession.manual_entry_by_name ? (
                    <p className="mt-2 inline-block rounded-lg bg-amber-500/20 px-2 py-1 text-[11px] font-semibold text-amber-100">
                      Manual entry by {activeSession.manual_entry_by_name}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm text-white/70">
                    Punched in at: {punchedInLabel}
                  </p>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-[#E8C84A]">
                    {workedLabel}
                  </p>
                  {lastLunchMinutes != null && !activeSession.on_lunch ? (
                    <p className="mt-2 text-sm text-white/60">
                      Lunch taken: {lastLunchMinutes} min
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setReceiptOpen(true)}
                    className="mt-4 w-full rounded-xl border-2 border-[#E8C84A]/50 bg-[#E8C84A]/10 py-3 text-sm font-bold text-[#E8C84A] active:bg-[#E8C84A]/20"
                  >
                    📷 Receipt
                  </button>
                </div>

                <label className="block text-sm font-medium text-white/90">
                  Notes
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={busy}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-xl border border-white/20 bg-[#071422] px-4 py-3 text-base text-white"
                  />
                </label>

                {activeSession.on_lunch ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-center text-sm font-medium tabular-nums text-amber-200/95">
                      On lunch: {onLunchLiveLabel}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onEndLunch()}
                      className="flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-lg font-bold text-white shadow-lg shadow-emerald-900/30 active:bg-emerald-400 disabled:opacity-40"
                    >
                      <span aria-hidden>✅</span>
                      <span>End Lunch</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onStartLunch()}
                    className="flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 text-lg font-bold text-amber-950 shadow-lg shadow-amber-900/25 active:bg-amber-300 disabled:opacity-40"
                  >
                    <span aria-hidden>🍽️</span>
                    <span>Start Lunch</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onPunchOut()}
                  className="flex min-h-[3.5rem] w-full items-center justify-center rounded-2xl bg-red-600 text-lg font-bold text-white shadow-lg active:bg-red-500 disabled:opacity-40"
                >
                  PUNCH OUT
                </button>
              </>
            )}

            {isCompanyAdmin && teamActive && teamActive.length > 0 ? (
              <section className="overflow-hidden rounded-2xl border border-white/15">
                <h2 className="bg-[#071422] px-3 py-2.5 text-sm font-semibold text-white/90">
                  Currently on site
                </h2>
                <ul className="divide-y divide-white/10 bg-[#060d18]">
                  {teamActive.map((row) => {
                    void clockTick;
                    const workedTeam = workedMsFromPunch(
                      {
                        punch_in_at: row.punchInAt,
                        on_lunch: row.onLunch,
                        lunch_start_at: row.lunchStartAt,
                        total_lunch_ms: row.totalLunchMs,
                      },
                      Date.now(),
                    );
                    const punchInDisplay = new Date(
                      row.punchInAt,
                    ).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    });
                    const gpsTier = teamClockGpsDotForOpenPunch({
                      punch_in_location: row.punchInLocation,
                      lunch_start_location: row.lunchStartLocation,
                      gps_override_at: row.gpsOverrideAt ?? null,
                      on_lunch: row.onLunch,
                    });
                    const dotBg =
                      gpsTier === "green"
                        ? "bg-emerald-400"
                        : gpsTier === "yellow"
                          ? "bg-amber-400"
                          : "bg-red-500";
                    return (
                      <li key={row.id} className="px-3 py-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="flex items-center gap-2 font-semibold text-white">
                              <span
                                className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dotBg}`}
                                title="GPS vs job site"
                                aria-hidden
                              />
                              {row.fullName}
                            </p>
                            <p className="text-xs text-white/60">
                              {row.jobName?.trim() || "—"} · In {punchInDisplay}
                            </p>
                            {row.isManualEntry && row.manualEntryByName ? (
                              <p className="mt-1 text-[10px] font-semibold text-amber-200/90">
                                Manual entry by {row.manualEntryByName}
                              </p>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-base font-bold tabular-nums text-[#E8C84A]">
                              {formatMsAsHms(workedTeam)}
                            </p>
                            {row.onLunch ? (
                              <p className="text-xs font-medium text-amber-200">
                                On lunch
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {receiptOpen && activeSession ? (
              <div
                className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center"
                role="dialog"
                aria-label="Capture receipt"
              >
                <div className="max-h-[min(90dvh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0a1628] p-4 shadow-2xl">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-white">
                      Capture receipt
                    </h2>
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-lg text-white/70 hover:bg-white/10"
                      aria-label="Close"
                      onClick={() => setReceiptOpen(false)}
                    >
                      ×
                    </button>
                  </div>
                  <ReceiptCapture
                    jobId={activeSession.job_id}
                    title="Scan receipt"
                    onSaved={() => {
                      setReceiptOpen(false);
                      setMsg("Receipt saved.");
                    }}
                  />
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 rounded-2xl border border-white/15 bg-[#071422]/90 p-4 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="block text-xs font-medium text-white/70">
                From
                <input
                  type="date"
                  value={auditFrom}
                  onChange={(e) => setAuditFrom(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-white/20 bg-[#060d18] px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block text-xs font-medium text-white/70">
                To
                <input
                  type="date"
                  value={auditTo}
                  onChange={(e) => setAuditTo(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-white/20 bg-[#060d18] px-3 py-2 text-sm text-white"
                />
              </label>
              <button
                type="button"
                disabled={auditLoading}
                onClick={() => void loadAuditAndJobs()}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white active:bg-white/20 disabled:opacity-50"
              >
                {auditLoading ? "Loading…" : "Refresh"}
              </button>
              {auditExportHref ? (
                <a
                  href={auditExportHref}
                  className="inline-flex items-center justify-center rounded-lg bg-[#E8C84A] px-4 py-2 text-sm font-bold text-[#0a1628] active:opacity-90"
                >
                  Export payroll (CSV)
                </a>
              ) : null}
            </div>

            {auditMsg ? (
              <p
                className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-100"
                role="alert"
              >
                {auditMsg}
              </p>
            ) : null}

            <section className="overflow-hidden rounded-2xl border border-white/15">
              <h2 className="bg-[#071422] px-3 py-2.5 text-sm font-semibold">
                Active jobs ({auditFrom} → {auditTo})
              </h2>
              {jobsLoading ? (
                <p className="px-3 py-4 text-sm text-white/50">Loading…</p>
              ) : jobsToday.length === 0 ? (
                <p className="px-3 py-4 text-sm text-white/50">
                  No job activity in this range.
                </p>
              ) : (
                <ul className="divide-y divide-white/10 bg-[#060d18]">
                  {jobsToday.map((j, idx) => (
                    <li
                      key={`${j.jobId ?? "no-id"}-${j.jobName}-${idx}`}
                      className="px-3 py-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium text-white">
                          {j.jobName}
                        </span>
                        <span className="tabular-nums text-[#E8C84A]">
                          {j.hoursInRange.toFixed(2)} hrs
                        </span>
                      </div>
                      {j.currentlyOnSite.length > 0 ? (
                        <p className="mt-1 text-xs text-emerald-200/90">
                          On site:{" "}
                          {j.currentlyOnSite.map((w) => w.name).join(", ")}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-white/40">
                          No open punches on this job.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-white/15">
              <h2 className="bg-[#071422] px-3 py-2.5 text-sm font-semibold">
                Punch audit
              </h2>
              {auditLoading ? (
                <p className="px-3 py-4 text-sm text-white/50">Loading…</p>
              ) : auditPunches.length === 0 ? (
                <p className="px-3 py-4 text-sm text-white/50">
                  No punches in range.
                </p>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto bg-[#060d18]">
                  <ul className="divide-y divide-white/10">
                    {auditPunches.map((p) => {
                      const busy = auditBusyId === p.id;
                      return (
                        <li key={p.id} className="px-3 py-3 text-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-white">
                                {p.employeeName}
                              </p>
                              <p className="text-xs text-white/55">
                                {formatAuditTs(p.punchInAt)}
                                {" → "}
                                {p.punchOutAt
                                  ? formatAuditTs(p.punchOutAt)
                                  : "open"}
                              </p>
                              <p className="mt-1 text-xs text-white/70">
                                {p.jobName} · {p.workedHours} hrs · lunch{" "}
                                {p.lunchMinutes}m
                              </p>
                            </div>
                            <span
                              className={
                                p.approvalStatus === "approved"
                                  ? "text-emerald-300"
                                  : p.approvalStatus === "rejected"
                                    ? "text-red-300"
                                    : "text-amber-200/90"
                              }
                            >
                              {p.isOpen
                                ? "Open"
                                : (p.approvalStatus ?? "pending")}
                            </span>
                          </div>
                          {p.discrepancyFlag || p.discrepancyNote ? (
                            <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-100">
                              {p.discrepancyNote?.trim() || "Flagged"}
                            </p>
                          ) : null}
                          {!p.isOpen ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void patchAudit(p.id, {
                                    approvalStatus: "approved",
                                  })
                                }
                                className="rounded-md bg-emerald-600/80 px-2 py-1 text-xs font-semibold disabled:opacity-40"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void patchAudit(p.id, {
                                    approvalStatus: "rejected",
                                  })
                                }
                                className="rounded-md bg-red-600/70 px-2 py-1 text-xs font-semibold disabled:opacity-40"
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void patchAudit(p.id, {
                                    approvalStatus: "pending",
                                  })
                                }
                                className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold disabled:opacity-40"
                              >
                                Pending
                              </button>
                            </div>
                          ) : null}
                          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-white/80">
                            <input
                              type="checkbox"
                              checked={p.discrepancyFlag}
                              disabled={busy}
                              onChange={(e) =>
                                void patchAudit(p.id, {
                                  discrepancyFlag: e.target.checked,
                                })
                              }
                            />
                            Flag discrepancy
                          </label>
                          <input
                            key={`dn-${p.id}-${p.discrepancyNote ?? ""}`}
                            type="text"
                            disabled={busy}
                            placeholder="Discrepancy note (save on blur)"
                            defaultValue={p.discrepancyNote ?? ""}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v === (p.discrepancyNote ?? "").trim()) return;
                              void patchAudit(p.id, {
                                discrepancyNote: v || null,
                              });
                            }}
                            className="mt-1 w-full rounded-lg border border-white/15 bg-[#071422] px-2 py-1.5 text-xs text-white placeholder:text-white/35"
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
