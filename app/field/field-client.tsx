"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";

type ActiveSession = {
  id: string;
  job_id: string | null;
  job_name: string | null;
  clock_in_at: string;
  on_lunch: boolean;
};

type JobOpt = { id: string; job_name: string; job_number: string };

export function FieldClient() {
  const searchParams = useSearchParams();
  const qpJob = searchParams.get("jobId")?.trim() ?? "";

  const [showPunch, setShowPunch] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [jobs, setJobs] = useState<JobOpt[]>([]);
  const [jobId, setJobId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
        activeSession?: ActiveSession | null;
        jobs?: JobOpt[];
        error?: string;
      };
      if (!r.ok || j.error) {
        setMsg(j.error ?? "Could not load time clock.");
        return;
      }
      setShowPunch(Boolean(j.showPunchInterface));
      setActiveSession(j.activeSession ?? null);
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
    if (!jobs.length) return;
    if (qpJob && jobs.some((j) => j.id === qpJob)) {
      setJobId(qpJob);
      return;
    }
    setJobId((prev) =>
      prev && jobs.some((j) => j.id === prev) ? prev : jobs[0]!.id,
    );
  }, [qpJob, jobs]);

  const postAction = async (body: {
    action: string;
    jobId?: string | null;
  }) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/time-clock", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setMsg(j.error ?? "Request failed.");
        return;
      }
      await refresh();
    } catch {
      setMsg("Request failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="jobs" showTppSubtitle />
        <main className="app-page-shell mx-auto max-w-lg flex-1 px-4 py-10">
          <p className="text-[var(--foreground-muted)]">Loading…</p>
        </main>
      </div>
    );
  }

  if (!showPunch) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="jobs" showTppSubtitle />
        <main className="app-page-shell mx-auto max-w-lg flex-1 px-4 py-10">
          <h1 className="text-xl font-semibold text-[var(--foreground)]">
            Time clock
          </h1>
          <p className="mt-3 text-sm text-[var(--foreground-muted)]">
            Time clock access is not enabled for your account. Ask a super
            admin to turn on “Time Clock Access” for your profile.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block text-sm font-medium text-[#E8C84A] hover:underline"
          >
            ← Project Dashboard
          </Link>
        </main>
      </div>
    );
  }

  const elapsed = activeSession
    ? (() => {
        const start = new Date(activeSession.clock_in_at).getTime();
        const mins = Math.max(
          0,
          Math.floor((Date.now() - start) / 60000),
        );
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h} hrs ${m} min`;
      })()
    : "";

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="jobs" showTppSubtitle />
      <main className="app-page-shell mx-auto max-w-lg flex-1 px-4 py-8">
        <Link
          href="/dashboard"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-[var(--foreground)]">
          ⏱ Time Clock
        </h1>

        {msg ? (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-200" role="alert">
            {msg}
          </p>
        ) : null}

        {!activeSession ? (
          <div className="mt-8 space-y-4">
            <p className="text-sm text-[var(--foreground-muted)]">
              Not clocked in today
            </p>
            <label className="block text-sm font-medium text-[var(--foreground)]">
              Job
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                disabled={busy}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-[var(--foreground)]"
              >
                {jobs.length === 0 ? (
                  <option value="">No jobs available</option>
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
              disabled={busy || !jobId}
              onClick={() => void postAction({ action: "punch_in", jobId })}
              className="flex h-14 w-full items-center justify-center rounded-lg bg-emerald-600 text-lg font-bold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              PUNCH IN
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <p className="text-sm text-[var(--foreground-muted)]">
              On the clock: {elapsed}
            </p>
            <p className="text-base font-semibold text-[var(--foreground)]">
              {activeSession.job_name?.trim() || "—"}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void postAction({ action: "punch_out" })}
              className="flex h-14 w-full items-center justify-center rounded-lg bg-red-600 text-lg font-bold text-white shadow-sm transition-colors hover:bg-red-500 disabled:opacity-40"
            >
              PUNCH OUT
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void postAction({ action: "lunch_toggle" })}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-amber-500 text-sm font-bold text-amber-950 transition-colors hover:bg-amber-400 disabled:opacity-40"
            >
              {activeSession.on_lunch ? "End lunch" : "Lunch"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
