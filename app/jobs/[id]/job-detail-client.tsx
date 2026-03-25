"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { JobDailyLogsTab } from "@/components/job-daily-logs-tab";
import { WideAppHeader } from "@/components/wide-app-header";
import { useUserRole } from "@/hooks/use-user-role";
import { createBrowserClient } from "@/lib/supabase/client";
import type {
  CustomerRow,
  JobAttachmentRow,
  JobRow,
} from "@/lib/jobs-types";

function attachmentHref(
  type: string,
  id: string,
): { href: string; label: string } {
  switch (type) {
    case "blueprint_project":
      return { href: `/project/${id}`, label: "Open blueprint project" };
    case "wifi_calculation":
      return { href: "/tools/wifi-analyzer", label: "Open Wi‑Fi analyzer" };
    case "load_calculation":
      return { href: "/tools/load-calculator", label: "Open load calculator" };
    case "nec_checklist":
      return { href: "/tools/nec-checker", label: "Open NEC checker" };
    case "project_breakdown":
      return {
        href: `/tools/project-breakdown?id=${encodeURIComponent(id)}`,
        label: "Open project breakdown",
      };
    case "takeoff":
      return { href: `/project/${id}`, label: "Open project / takeoff" };
    default:
      return { href: "#", label: "Open" };
  }
}

const FINANCIAL_ATTACHMENT_TYPES = new Set([
  "project_breakdown",
  "wifi_calculation",
  "av_calculation",
  "smarthome_calculation",
  "electrical_calculation",
]);

export function JobDetailClient({ jobId }: { jobId: string }) {
  const { canAccessFinancialTools, canRemoveJobAttachments } = useUserRole();
  const [job, setJob] = useState<JobRow | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [attachments, setAttachments] = useState<JobAttachmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "daily">("overview");

  const projectBreakdownHref = useMemo(() => {
    const a = attachments.find(
      (x) => x.attachment_type === "project_breakdown",
    );
    if (!a) return null;
    return `/tools/project-breakdown?id=${encodeURIComponent(a.attachment_id)}`;
  }, [attachments]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const sb = createBrowserClient();
      const { data: j, error: je } = await sb
        .from("jobs")
        .select("*")
        .eq("id", jobId)
        .maybeSingle();
      if (je || !j) {
        setError("Job not found.");
        return;
      }
      setJob(j as JobRow);
      if (j.customer_id) {
        const { data: c } = await sb
          .from("customers")
          .select("*")
          .eq("id", j.customer_id)
          .maybeSingle();
        setCustomer((c as CustomerRow) ?? null);
      } else {
        setCustomer(null);
      }
      const { data: a } = await sb
        .from("job_attachments")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      setAttachments((a ?? []) as JobAttachmentRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const removeAttachment = async (attId: string) => {
    if (!window.confirm("Remove this link from the job?")) return;
    try {
      const sb = createBrowserClient();
      await sb.from("job_attachments").delete().eq("id", attId);
      void load();
    } catch {
      window.alert("Could not remove.");
    }
  };

  if (error || !job) {
    return (
      <div className="flex min-h-screen flex-col">
        <WideAppHeader active="jobs" showTppSubtitle />
        <main className="p-10 text-red-200">{error ?? "Loading…"}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="jobs" showTppSubtitle />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Link
          href="/jobs"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← All jobs
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">
          {job.job_number} · {job.job_name}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-sky-500/15 px-3 py-0.5 text-sky-200">
            {job.job_type}
          </span>
          <span className="rounded-full bg-[#E8C84A]/15 px-3 py-0.5 text-[#E8C84A]">
            {job.status}
          </span>
        </div>

        <div
          className="mt-8 flex gap-1 border-b border-white/10 pb-0"
          role="tablist"
          aria-label="Job sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "overview"}
            className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === "overview"
                ? "bg-white/[0.08] text-[#E8C84A]"
                : "text-white/55 hover:bg-white/[0.04] hover:text-white/80"
            }`}
            onClick={() => setTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "daily"}
            className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === "daily"
                ? "bg-white/[0.08] text-[#E8C84A]"
                : "text-white/55 hover:bg-white/[0.04] hover:text-white/80"
            }`}
            onClick={() => setTab("daily")}
          >
            Daily logs
          </button>
        </div>

        {tab === "daily" ? (
          <JobDailyLogsTab
            jobId={jobId}
            jobName={`${job.job_number} · ${job.job_name}`}
            projectBreakdownHref={projectBreakdownHref}
          />
        ) : null}

        {tab === "overview" ? (
          <>
        <section className="mt-8 rounded-xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">
            Job details
          </h2>
          <dl className="mt-3 space-y-2 text-sm text-white/80">
            {[job.address, job.city, job.state, job.zip].some(Boolean) ? (
              <div>
                <dt className="text-white/45">Address</dt>
                <dd>
                  {[job.address, job.city, job.state, job.zip]
                    .filter(Boolean)
                    .join(", ")}
                </dd>
              </div>
            ) : null}
            {job.description ? (
              <div>
                <dt className="text-white/45">Description</dt>
                <dd>{job.description}</dd>
              </div>
            ) : null}
            {job.notes ? (
              <div>
                <dt className="text-white/45">Notes</dt>
                <dd>{job.notes}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">
            Customer
          </h2>
          {customer ? (
            <div className="mt-3 text-sm text-white/85">
              <p className="font-medium">{customer.company_name || "—"}</p>
              <p>{customer.contact_name}</p>
              <p className="text-white/55">{customer.email}</p>
              <p className="text-white/55">{customer.phone}</p>
              <Link
                href={`/customers/${customer.id}`}
                className="mt-2 inline-block text-[#E8C84A] hover:underline"
              >
                View customer
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-sm text-white/45">No customer linked.</p>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">
            Attached items
          </h2>
          {attachments.length === 0 ? (
            <p className="mt-3 text-sm text-white/45">No attachments yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {attachments.map((a) => {
                if (
                  !canAccessFinancialTools &&
                  FINANCIAL_ATTACHMENT_TYPES.has(a.attachment_type)
                ) {
                  return null;
                }
                const { href, label } = attachmentHref(
                  a.attachment_type,
                  a.attachment_id,
                );
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/8 bg-[#0a1628]/60 px-3 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">
                        {a.label || a.attachment_type.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-white/45">
                        {a.attachment_type} ·{" "}
                        {new Date(a.created_at).toLocaleString()}
                      </p>
                      <p className="font-mono text-[10px] text-white/35">
                        {a.attachment_id}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {href !== "#" ? (
                        <Link
                          href={href}
                          className="rounded-lg border border-[#E8C84A]/45 px-3 py-1.5 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/10"
                        >
                          {label}
                        </Link>
                      ) : null}
                      {canRemoveJobAttachments ? (
                        <button
                          type="button"
                          onClick={() => void removeAttachment(a.id)}
                          className="rounded-lg border border-red-500/35 px-3 py-1.5 text-xs text-red-200 hover:bg-red-950/40"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
