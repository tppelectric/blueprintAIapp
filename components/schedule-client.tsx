"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DarkListSkeleton, EmptyState } from "@/components/app-polish";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { addDays, toIsoDate } from "@/lib/time-calendar-helpers";
import { userDisplayName } from "@/lib/user-display-name";
import type { ScheduleAssignmentRow } from "@/lib/time-management-types";
import { createBrowserClient } from "@/lib/supabase/client";

const INACTIVE_JOB_STATUSES = new Set([
  "Completed",
  "Cancelled",
  "Closed",
  "Lost",
]);

type AssignableUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

type JobOpt = {
  id: string;
  label: string;
  status: string;
  search: string;
};

function jobLabel(j: { job_number?: unknown; job_name?: unknown }): string {
  const a = String(j.job_number ?? "").trim();
  const b = String(j.job_name ?? "").trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || "Job";
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function ScheduleClient() {
  const { showToast } = useAppToast();
  const { profile } = useUserRole();

  const [assignments, setAssignments] = useState<ScheduleAssignmentRow[]>([]);
  const [jobs, setJobs] = useState<JobOpt[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [canSchedule, setCanSchedule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const today = toIsoDate(new Date());
  const tomorrow = toIsoDate(addDays(new Date(), 1));
  const [empId, setEmpId] = useState("");
  const [date, setDate] = useState(today);
  const [jobId, setJobId] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createBrowserClient();

      const { data: aData, error: ae } = await sb
        .from("schedule_assignments")
        .select("*")
        .gte("schedule_date", today)
        .order("schedule_date", { ascending: true });
      if (ae) throw ae;
      setAssignments((aData ?? []) as ScheduleAssignmentRow[]);

      const { data: jd } = await sb
        .from("jobs")
        .select("id,job_name,job_number,status")
        .order("updated_at", { ascending: false })
        .limit(400);
      setJobs(
        (jd ?? []).map((j) => {
          const rec = j as Record<string, unknown>;
          const label = jobLabel(rec);
          return {
            id: j.id as string,
            label,
            status: String(rec.status ?? "").trim() || "Lead",
            search: label.toLowerCase(),
          };
        }),
      );

      // Scheduler gate: 200 => can schedule (+ user list); 403 => read-only.
      try {
        const r = await fetch("/api/schedule/assignable-users", {
          credentials: "include",
        });
        if (r.ok) {
          const j = (await r.json()) as { users?: AssignableUser[] };
          setUsers(j.users ?? []);
          setCanSchedule(true);
        } else {
          setUsers([]);
          setCanSchedule(false);
        }
      } catch {
        setCanSchedule(false);
      }
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not load schedule.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [today, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeJobs = useMemo(
    () => jobs.filter((j) => !INACTIVE_JOB_STATUSES.has(j.status)),
    [jobs],
  );

  const jobOptions = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    if (!q) return activeJobs;
    return activeJobs.filter((j) => j.search.includes(q));
  }, [activeJobs, jobSearch]);

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduleAssignmentRow[]>();
    for (const a of assignments) {
      const arr = m.get(a.schedule_date) ?? [];
      arr.push(a);
      m.set(a.schedule_date, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [assignments]);

  const createAssignment = async () => {
    if (!empId || !date || !jobId) {
      showToast({
        message: "Pick an employee, date, and job.",
        variant: "error",
      });
      return;
    }
    const emp = users.find((u) => u.id === empId);
    const job = jobs.find((j) => j.id === jobId);
    setBusy(true);
    try {
      const sb = createBrowserClient();
      const { error } = await sb.from("schedule_assignments").insert({
        employee_id: empId,
        employee_name: emp ? userDisplayName(emp) : null,
        job_id: jobId,
        job_name: job?.label ?? null,
        schedule_date: date,
        notes: notes.trim() || null,
        created_by: profile?.id ?? null,
      });
      if (error) throw error;
      showToast({ message: "Assignment added.", variant: "success" });
      setNotes("");
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not add assignment.",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const deleteAssignment = async (a: ScheduleAssignmentRow) => {
    if (!window.confirm("Remove this assignment?")) return;
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("schedule_assignments")
        .delete()
        .eq("id", a.id);
      if (error) throw error;
      void load();
    } catch {
      showToast({ message: "Could not remove.", variant: "error" });
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="team_time" showTppSubtitle />
      <main className="app-page-shell mx-auto max-w-3xl flex-1 py-8 md:py-10">
        <Link href="/dashboard" className="text-sm text-[#E8C84A] hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">Schedule</h1>
        <p className="mt-1 text-sm text-white/55">
          Assign crew to jobs by day. Approved time off and worked hours show on
          the{" "}
          <Link href="/calendar" className="text-[#E8C84A] hover:underline">
            calendar
          </Link>
          .
        </p>

        {loading ? (
          <DarkListSkeleton className="mt-8" rows={6} />
        ) : (
          <>
            {canSchedule ? (
              <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <h2 className="text-sm font-bold uppercase tracking-wide text-white/55">
                  New assignment
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-xs text-white/50">
                    Employee
                    <select
                      className="app-input mt-1 w-full text-sm"
                      value={empId}
                      onChange={(e) => setEmpId(e.target.value)}
                    >
                      <option value="">— Choose —</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {userDisplayName(u)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-white/50">
                    Date
                    <input
                      type="date"
                      className="app-input mt-1 w-full text-sm"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-white/50">
                      Job — search number, name
                      <input
                        className="app-input mt-1 w-full text-sm"
                        value={jobSearch}
                        onChange={(e) => setJobSearch(e.target.value)}
                        placeholder="Type to filter…"
                        autoComplete="off"
                      />
                    </label>
                    <select
                      className="app-input mt-2 w-full text-sm"
                      size={5}
                      value={jobId}
                      onChange={(e) => setJobId(e.target.value)}
                    >
                      <option value="">— Choose job —</option>
                      {jobOptions.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="text-xs text-white/50 sm:col-span-2">
                    Notes (optional)
                    <input
                      className="app-input mt-1 w-full text-sm"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. start 7am, bring lift"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={busy || !empId || !jobId || !date}
                  onClick={() => void createAssignment()}
                  className="btn-primary btn-h-11 mt-4 disabled:opacity-50"
                >
                  {busy ? "Adding…" : "Add assignment"}
                </button>
              </section>
            ) : null}

            <section className="mt-10">
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#E8C84A]">
                Upcoming
              </h2>
              {byDate.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    icon={<span aria-hidden>🗓️</span>}
                    title="No upcoming assignments"
                    description={
                      canSchedule
                        ? "Add an assignment above to schedule crew to a job."
                        : "Scheduled crew assignments will appear here."
                    }
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-6">
                  {byDate.map(([d, rows]) => (
                    <div key={d}>
                      <p
                        className={`text-sm font-semibold ${d === today ? "text-[#E8C84A]" : "text-white/80"}`}
                      >
                        {d === today
                          ? "Today · "
                          : d === tomorrow
                            ? "Tomorrow · "
                            : ""}
                        {prettyDate(d)}
                      </p>
                      <div className="mt-2 space-y-2">
                        {rows.map((a) => (
                          <div
                            key={a.id}
                            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                          >
                            <span className="font-medium text-white">
                              {a.employee_name ?? "—"}
                            </span>
                            <span className="text-sm text-emerald-200/90">
                              {a.job_name ?? "—"}
                            </span>
                            {a.notes ? (
                              <span className="text-xs text-white/45">
                                {a.notes}
                              </span>
                            ) : null}
                            {canSchedule ? (
                              <button
                                type="button"
                                onClick={() => void deleteAssignment(a)}
                                className="ml-auto text-xs font-semibold text-red-300 hover:underline"
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
