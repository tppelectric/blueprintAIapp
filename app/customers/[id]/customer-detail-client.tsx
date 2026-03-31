"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { createBrowserClient } from "@/lib/supabase/client";
import type { CustomerRow, JobRow } from "@/lib/jobs-types";

function formatStatus(status: string | null): string {
  if (status == null || !String(status).trim()) return "—";
  const k = status.trim().toLowerCase();
  const map: Record<string, string> = {
    lead: "Lead",
    quoted: "Quoted",
    active: "Active",
    complete: "Complete",
    cancelled: "Cancelled",
  };
  return (
    map[k] ??
    status
      .trim()
      .replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
  );
}

function formatCustomerSince(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatJobUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function jobOpenSectionStatusBadgeClass(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "active")
    return "rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200 ring-1 ring-amber-500/30";
  if (s === "quoted")
    return "rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200 ring-1 ring-sky-500/30";
  if (s === "lead")
    return "rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/55 ring-1 ring-white/15";
  return "rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/60 ring-1 ring-white/15";
}

function jobCompletedStatusBadgeClass(): string {
  return "rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200 ring-1 ring-emerald-500/30";
}

function isOpenJobStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s !== "complete" && s !== "cancelled";
}

export function CustomerDetailClient({ id }: { id: string }) {
  const [c, setC] = useState<CustomerRow | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      const { data: cust, error: ce } = await sb
        .from("customers")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (ce || !cust) {
        setError("Customer not found.");
        return;
      }
      setC(cust as CustomerRow);
      const { data: j } = await sb
        .from("jobs")
        .select("*")
        .eq("customer_id", id)
        .order("updated_at", { ascending: false });
      setJobs((j ?? []) as JobRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
    }
  }, [id]);

  useEffect(() => {
    // Fetch customer + jobs on mount / id change; load is async (setState after await).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount fetch
    void load();
  }, [load]);

  const openJobs = useMemo(
    () => jobs.filter((j) => isOpenJobStatus(j.status)),
    [jobs],
  );

  const completedJobs = useMemo(
    () => jobs.filter((j) => j.status.trim().toLowerCase() === "complete"),
    [jobs],
  );

  const addressLine = [c?.address, c?.city, c?.state, c?.zip]
    .filter(Boolean)
    .join(", ");

  if (error || !c) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="customers" showTppSubtitle />
        <main className="p-10 text-red-200">{error ?? "…"}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="customers" showTppSubtitle />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <Link
          href="/customers"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← Customers
        </Link>

        <div className="relative mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-6">
          {c.jobtread_id?.trim() ? (
            <span className="absolute right-4 top-4 rounded-full border border-[#E8C84A]/40 bg-[#E8C84A]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#E8C84A]">
              Synced from JobTread
            </span>
          ) : null}
          <h1 className="pr-36 text-2xl font-bold text-white md:pr-44">
            {c.company_name?.trim() ||
              c.contact_name?.trim() ||
              "Customer"}
          </h1>
          {c.company_name?.trim() && c.contact_name?.trim() ? (
            <p className="mt-1 text-base text-white/60">
              {c.contact_name}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            {c.phone?.trim() ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0a1628]/60 px-3 py-1 text-xs text-white/90">
                <span aria-hidden>📞</span>
                {c.phone}
              </span>
            ) : null}
            {c.email?.trim() ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0a1628]/60 px-3 py-1 text-xs text-white/90">
                <span aria-hidden>✉</span>
                {c.email}
              </span>
            ) : null}
            {addressLine ? (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-[#0a1628]/60 px-3 py-1 text-xs text-white/90">
                <span aria-hidden>📍</span>
                <span className="truncate">{addressLine}</span>
              </span>
            ) : null}
          </div>
          {c.notes?.trim() ? (
            <div className="mt-6 rounded-lg border border-white/5 bg-white/[0.03] p-4 text-sm text-white/50">
              {c.notes}
            </div>
          ) : null}
        </div>

        <div className="mt-8 lg:grid lg:grid-cols-3 lg:gap-6">
          <div className="flex flex-col gap-10 lg:col-span-2">
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">
                Open jobs
              </h2>
              {openJobs.length === 0 ? (
                <p className="mt-3 text-sm text-white/45">No open jobs.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {openJobs.map((j) => (
                    <li
                      key={j.id}
                      className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                    >
                      <Link
                        href={`/jobs/${j.id}`}
                        className="text-sm font-semibold text-white hover:text-[#E8C84A] hover:underline"
                      >
                        {j.job_number} · {j.job_name}
                      </Link>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70 ring-1 ring-white/15">
                          {j.job_type}
                        </span>
                        <span
                          className={jobOpenSectionStatusBadgeClass(j.status)}
                        >
                          {formatStatus(j.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-white/45">
                        Updated {formatJobUpdated(j.updated_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">
                Completed jobs
              </h2>
              {completedJobs.length === 0 ? (
                <p className="mt-3 text-sm text-white/45">
                  No completed jobs yet.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {completedJobs.map((j) => (
                    <li
                      key={j.id}
                      className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                    >
                      <Link
                        href={`/jobs/${j.id}`}
                        className="text-sm font-semibold text-white hover:text-[#E8C84A] hover:underline"
                      >
                        {j.job_number} · {j.job_name}
                      </Link>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70 ring-1 ring-white/15">
                          {j.job_type}
                        </span>
                        <span className={jobCompletedStatusBadgeClass()}>
                          {formatStatus(j.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-white/45">
                        Updated {formatJobUpdated(j.updated_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="mt-10 flex flex-col gap-6 lg:col-span-1 lg:mt-0">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-white/60">
                Quick stats
              </h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-2 text-white/80">
                  <dt className="text-white/50">Total jobs</dt>
                  <dd className="font-semibold tabular-nums text-white">
                    {jobs.length}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 text-white/80">
                  <dt className="text-white/50">Open jobs</dt>
                  <dd className="font-semibold tabular-nums text-white">
                    {openJobs.length}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 text-white/80">
                  <dt className="text-white/50">Completed</dt>
                  <dd className="font-semibold tabular-nums text-white">
                    {completedJobs.length}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 text-white/80">
                  <dt className="text-white/50">Customer since</dt>
                  <dd className="font-medium text-white/90">
                    {formatCustomerSince(c.created_at)}
                  </dd>
                </div>
              </dl>
            </div>
            <Link
              href={`/jobs?customer_id=${encodeURIComponent(id)}`}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-[#E8C84A] px-4 text-sm font-bold text-[#0a1628] hover:brightness-110"
            >
              Add job
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
