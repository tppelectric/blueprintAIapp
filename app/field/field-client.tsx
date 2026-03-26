"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatWorkedHrsMins,
  workedMsFromPunch,
} from "@/lib/time-punch-worked";

type ActivePunch = {
  id: string;
  job_id: string | null;
  job_name: string | null;
  punch_in_at: string;
  notes: string | null;
  on_lunch: boolean;
  lunch_start_at: string | null;
  total_lunch_ms: number;
};

type JobOpt = { id: string; job_name: string; job_number: string };

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

export function FieldClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qpJob = searchParams.get("jobId")?.trim() ?? "";

  const [showPunch, setShowPunch] = useState(false);
  const [activeSession, setActiveSession] = useState<ActivePunch | null>(null);
  const [jobs, setJobs] = useState<JobOpt[]>([]);
  const [jobId, setJobId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [lastLunchMinutes, setLastLunchMinutes] = useState<number | null>(null);
  const [punchSummary, setPunchSummary] = useState<PunchSummary | null>(null);
  const notesBaseline = useRef("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch("/api/time-clock", { credentials: "include" });
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      const j = (await r.json()) as {
        showPunchInterface?: boolean;
        activeSession?: ActivePunch | null;
        jobs?: JobOpt[];
        error?: string;
      };
      if (!r.ok || j.error) {
        setMsg(j.error ?? "Could not load time clock.");
        return;
      }
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
    } catch {
      setMsg("Could not load time clock.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeSession) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [activeSession?.id]);

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
    const j = await postJson({
      action: "punch_in",
      jobId,
      notes: notes.trim() || undefined,
    });
    if (!j || "error" in j) return;
    await refresh();
  };

  const onPunchOut = async () => {
    if (!window.confirm("End your shift?")) return;
    const j = await postJson({ action: "punch_out" });
    if (!j || !("summary" in j) || !j.summary) return;
    setPunchSummary(j.summary);
    setActiveSession(null);
    setNotes("");
  };

  const onStartLunch = async () => {
    const j = await postJson({ action: "start_lunch" });
    if (!j || "error" in j) return;
    await refresh();
  };

  const onEndLunch = async () => {
    const j = await postJson({ action: "end_lunch" });
    if (!j || "error" in j) return;
    if (typeof j.lastLunchMinutes === "number") {
      setLastLunchMinutes(j.lastLunchMinutes);
    }
    await refresh();
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
              Total: {punchSummary.totalHours} hrs
              {punchSummary.overtimeHours > 0
                ? ` (${punchSummary.overtimeHours} OT)`
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

  const workedLabel =
    activeSession && !punchSummary
      ? formatWorkedHrsMins(
          workedMsFromPunch(
            {
              punch_in_at: activeSession.punch_in_at,
              on_lunch: activeSession.on_lunch,
              lunch_start_at: activeSession.lunch_start_at,
              total_lunch_ms: activeSession.total_lunch_ms,
            },
            Date.now(),
          ),
        )
      : "";

  const punchedInLabel = activeSession
    ? new Date(activeSession.punch_in_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="min-h-[100dvh] touch-manipulation bg-gradient-to-b from-[#0a1628] to-[#060d1a] px-4 pb-12 pt-4 text-white">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <header className="flex items-center justify-between gap-2">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-[#E8C84A] active:opacity-80"
          >
            ← Dashboard
          </Link>
          <span className="sr-only tabular-nums" aria-live="polite">
            {tick}
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

        {!activeSession ? (
          <>
            <div className="text-center">
              <p className="text-sm text-white/60">Ready to start</p>
              <p className="mt-2 text-lg font-medium tabular-nums text-white">
                {nowLabel}
              </p>
            </div>

            <label className="block text-sm font-medium text-white/90">
              Job
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                disabled={busy}
                className="mt-2 w-full rounded-xl border border-white/20 bg-[#071422] px-4 py-3.5 text-base text-white"
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
              <p className="mt-2 text-sm text-white/70">
                Punched in at: {punchedInLabel}
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums text-[#E8C84A]">
                {workedLabel}
              </p>
              {activeSession.on_lunch ? (
                <p className="mt-2 text-sm font-medium text-amber-200">
                  On lunch — timer paused
                </p>
              ) : null}
              {lastLunchMinutes != null && !activeSession.on_lunch ? (
                <p className="mt-2 text-sm text-white/60">
                  Last lunch: {lastLunchMinutes} min
                </p>
              ) : null}
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
              <button
                type="button"
                disabled={busy}
                onClick={() => void onEndLunch()}
                className="flex min-h-[3.5rem] w-full items-center justify-center rounded-2xl bg-emerald-500 text-lg font-bold text-white shadow-lg active:bg-emerald-400 disabled:opacity-40"
              >
                END LUNCH
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onStartLunch()}
                className="flex min-h-[3.5rem] w-full items-center justify-center rounded-2xl bg-amber-400 text-lg font-bold text-amber-950 shadow-lg active:bg-amber-300 disabled:opacity-40"
              >
                START LUNCH
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
      </div>
    </div>
  );
}
