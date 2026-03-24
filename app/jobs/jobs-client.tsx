"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { createBrowserClient } from "@/lib/supabase/client";
import type { JobListRow } from "@/lib/jobs-types";

const KANBAN_STATUSES = [
  "Lead",
  "Quoted",
  "Active",
  "Complete",
  "On Hold",
  "Cancelled",
] as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export function JobsClient() {
  const [jobs, setJobs] = useState<JobListRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"kanban" | "list">("kanban");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createBrowserClient();
      const { data, error: qe } = await sb
        .from("jobs")
        .select(
          "id,job_name,job_number,status,job_type,address,city,state,zip,updated_at,customer_id, customers(company_name,contact_name)",
        )
        .order("updated_at", { ascending: false });
      if (qe) throw qe;
      const rows = (data ?? []) as unknown as JobListRow[];
      setJobs(rows);

      const att: Record<string, number> = {};
      if (rows.length) {
        const { data: ac } = await sb
          .from("job_attachments")
          .select("job_id");
        for (const r of ac ?? []) {
          const jid = (r as { job_id: string }).job_id;
          att[jid] = (att[jid] ?? 0) + 1;
        }
      }
      setCounts(att);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load jobs.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const customerLabel = (j: JobListRow) => {
    const raw = j.customers;
    const c = Array.isArray(raw) ? raw[0] : raw;
    if (!c) return "—";
    return c.company_name || c.contact_name || "—";
  };

  const JobCard = ({ j }: { j: JobListRow }) => (
    <Link
      href={`/jobs/${j.id}`}
      className="block rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm transition-colors hover:border-[#E8C84A]/45"
    >
      <p className="font-semibold text-white">
        {j.job_number} · {j.job_name}
      </p>
      <p className="mt-1 text-xs text-white/55">{customerLabel(j)}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-200">
          {j.job_type}
        </span>
        <span className="rounded-full bg-[#E8C84A]/15 px-2 py-0.5 text-[10px] text-[#E8C84A]">
          {j.status}
        </span>
      </div>
      {[j.address, j.city, j.state].filter(Boolean).length ? (
        <p className="mt-2 text-xs text-white/45">
          {[j.address, j.city, j.state, j.zip].filter(Boolean).join(", ")}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-white/40">
        {counts[j.id] ?? 0} attachment{(counts[j.id] ?? 0) === 1 ? "" : "s"} ·
        Updated {formatDate(j.updated_at)}
      </p>
    </Link>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="jobs" showTppSubtitle />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold text-white">Jobs</h1>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                view === "kanban"
                  ? "bg-[#E8C84A] text-[#0a1628]"
                  : "border border-white/20 text-white/80"
              }`}
            >
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                view === "list"
                  ? "bg-[#E8C84A] text-[#0a1628]"
                  : "border border-white/20 text-white/80"
              }`}
            >
              List
            </button>
            <Link
              href="/customers"
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/85 hover:bg-white/5"
            >
              Customers
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="mt-10 text-white/60">Loading…</p>
        ) : error ? (
          <p className="mt-10 text-red-200">{error}</p>
        ) : jobs.length === 0 ? (
          <p className="mt-10 text-white/55">
            No jobs yet. Link a saved tool result to a job, or create one from
            the link dialog.
          </p>
        ) : view === "list" ? (
          <ul className="mt-8 space-y-3">
            {jobs.map((j) => (
              <li key={j.id}>
                <JobCard j={j} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8 flex gap-3 overflow-x-auto pb-4">
            {KANBAN_STATUSES.map((st) => (
              <div
                key={st}
                className="w-72 shrink-0 rounded-xl border border-white/10 bg-[#071422]/60 p-3"
              >
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#E8C84A]/90">
                  {st}
                </h2>
                <div className="space-y-2">
                  {jobs
                    .filter((j) => j.status === st)
                    .map((j) => (
                      <JobCard key={j.id} j={j} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
