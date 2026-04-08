"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { JobDailyLogsTab } from "@/components/job-daily-logs-tab";
import { JobReceiptsTab } from "@/components/job-receipts-tab";
import { WideAppHeader } from "@/components/wide-app-header";
import { useUserRole } from "@/hooks/use-user-role";
import { createBrowserClient } from "@/lib/supabase/client";
import type {
  CustomerRow,
  JobAttachmentRow,
  JobCrewAssignmentRow,
  JobRow,
} from "@/lib/jobs-types";
import {
  userAssigneeOptionLabel,
  userDisplayName,
} from "@/lib/user-display-name";

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

type CrewAssignmentUserOption = {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
};

type JobInvoiceStatusHistoryEntry = {
  id: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changerName: string;
};

function formatInvoiceHistValue(v: string | null): string {
  return v != null && String(v).trim() ? v : "—";
}

const FINANCIAL_ATTACHMENT_TYPES = new Set([
  "project_breakdown",
  "wifi_calculation",
  "av_calculation",
  "smarthome_calculation",
  "electrical_calculation",
]);

function formatRole(role: string | null): string {
  if (role == null || !String(role).trim()) return "—";
  const k = role.trim().toLowerCase().replace(/\s+/g, "_");
  const map: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    field_tech: "Technician",
    estimator: "Estimator",
    office_manager: "Office Manager",
  };
  return map[k] ?? role.trim();
}

export function JobDetailClient({
  jobId,
  initialCrewAssignments = [],
}: {
  jobId: string;
  initialCrewAssignments?: JobCrewAssignmentRow[];
}) {
  const { canAccessFinancialTools, canRemoveJobAttachments } = useUserRole();
  const [job, setJob] = useState<JobRow | null>(null);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [attachments, setAttachments] = useState<JobAttachmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "daily" | "receipts">(
    "overview",
  );

  const [crewAssignments, setCrewAssignments] = useState<JobCrewAssignmentRow[]>(
    () => [...initialCrewAssignments],
  );
  const [showCrewAssignForm, setShowCrewAssignForm] = useState(false);
  const [crewAssignmentUsers, setCrewAssignmentUsers] = useState<
    CrewAssignmentUserOption[]
  >([]);
  const [crewAssignmentUsersLoading, setCrewAssignmentUsersLoading] =
    useState(false);
  const [selectedCrewUserId, setSelectedCrewUserId] = useState("");
  const [crewAssigning, setCrewAssigning] = useState(false);
  const [crewAssignError, setCrewAssignError] = useState<string | null>(null);
  const [invoiceStatusHistory, setInvoiceStatusHistory] = useState<
    JobInvoiceStatusHistoryEntry[]
  >([]);

  useEffect(() => {
    setCrewAssignments([...initialCrewAssignments]);
  }, [jobId, initialCrewAssignments]);

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
        setInvoiceStatusHistory([]);
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

      const { data: histRaw, error: histErr } = await sb
        .from("job_status_history")
        .select("id, old_value, new_value, changed_at, changed_by")
        .eq("job_id", jobId)
        .eq("field_changed", "need_ready_to_invoice")
        .order("changed_at", { ascending: false });
      if (histErr || !histRaw?.length) {
        setInvoiceStatusHistory([]);
      } else {
        const raw = histRaw as {
          id: string;
          old_value: string | null;
          new_value: string | null;
          changed_at: string;
          changed_by: string | null;
        }[];
        const changerIds = [
          ...new Set(
            raw.map((r) => r.changed_by).filter((x): x is string => !!x),
          ),
        ];
        const profileMap = new Map<
          string,
          {
            first_name: string | null;
            last_name: string | null;
            full_name: string | null;
            email: string | null;
          }
        >();
        if (changerIds.length) {
          const { data: profs } = await sb
            .from("user_profiles")
            .select("id, first_name, last_name, full_name, email")
            .in("id", changerIds);
          for (const p of profs ?? []) {
            const row = p as {
              id: string;
              first_name: string | null;
              last_name: string | null;
              full_name: string | null;
              email: string | null;
            };
            profileMap.set(row.id, row);
          }
        }
        setInvoiceStatusHistory(
          raw.map((r) => {
            const prof = r.changed_by
              ? profileMap.get(r.changed_by)
              : undefined;
            const changerName = prof
              ? userDisplayName({
                  first_name: prof.first_name,
                  last_name: prof.last_name,
                  full_name: prof.full_name,
                  email: prof.email,
                })
              : "—";
            return {
              id: r.id,
              old_value: r.old_value,
              new_value: r.new_value,
              changed_at: r.changed_at,
              changerName,
            };
          }),
        );
      }
    } catch (e) {
      setInvoiceStatusHistory([]);
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

  const openCrewAssignForm = useCallback(async () => {
    setShowCrewAssignForm(true);
    setCrewAssignError(null);
    if (crewAssignmentUsers.length > 0) return;
    setCrewAssignmentUsersLoading(true);
    try {
      const res = await fetch("/api/users/for-assignment", {
        credentials: "include",
      });
      if (!res.ok) {
        setCrewAssignError(
          res.status === 403
            ? "You cannot assign crew."
            : "Could not load users.",
        );
        return;
      }
      const j = (await res.json()) as { users?: CrewAssignmentUserOption[] };
      setCrewAssignmentUsers(j.users ?? []);
    } catch {
      setCrewAssignError("Could not load users.");
    } finally {
      setCrewAssignmentUsersLoading(false);
    }
  }, [crewAssignmentUsers.length]);

  const submitCrewAssignment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCrewUserId) return;
    setCrewAssigning(true);
    setCrewAssignError(null);
    try {
      const sb = createBrowserClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user?.id) {
        setCrewAssignError("Not signed in.");
        return;
      }
      const { error: insErr } = await sb.from("job_assignments").insert({
        job_id: jobId,
        user_id: selectedCrewUserId,
        role: "technician",
        assigned_by: user.id,
      });
      if (insErr) {
        setCrewAssignError(insErr.message);
        return;
      }
      const u = crewAssignmentUsers.find((x) => x.id === selectedCrewUserId);
      setCrewAssignments((prev) => [
        ...prev,
        {
          user_id: selectedCrewUserId,
          assigned_at: new Date().toISOString(),
          notes: null,
          user_profiles: {
            full_name: u?.full_name ?? null,
            first_name: u?.first_name ?? null,
            last_name: u?.last_name ?? null,
            email: u?.email ?? null,
            role: u?.role ?? null,
          },
        },
      ]);
      setShowCrewAssignForm(false);
      setSelectedCrewUserId("");
    } finally {
      setCrewAssigning(false);
    }
  };

  const removeCrewMember = async (userId: string) => {
    if (!window.confirm("Remove this crew member from the job?")) return;
    try {
      const sb = createBrowserClient();
      const { error: delErr } = await sb
        .from("job_assignments")
        .delete()
        .eq("job_id", jobId)
        .eq("user_id", userId);
      if (delErr) {
        window.alert(delErr.message);
        return;
      }
      setCrewAssignments((prev) => prev.filter((r) => r.user_id !== userId));
    } catch {
      window.alert("Could not remove crew member.");
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
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

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/jobs/daily-logs/new?job_id=${encodeURIComponent(jobId)}`}
            className="inline-flex items-center rounded-lg border border-[#E8C84A]/50 px-3 py-1.5 text-xs font-medium text-[#E8C84A] hover:bg-[#E8C84A]/10"
          >
            + Add Daily Log →
          </Link>
          {customer ? (
            <Link
              href={`/customers/${customer.id}`}
              className="inline-flex items-center rounded-lg border border-[#E8C84A]/50 px-3 py-1.5 text-xs font-medium text-[#E8C84A] hover:bg-[#E8C84A]/10"
            >
              View Customer →
            </Link>
          ) : null}
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
          <button
            type="button"
            role="tab"
            aria-selected={tab === "receipts"}
            className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === "receipts"
                ? "bg-white/[0.08] text-[#E8C84A]"
                : "text-white/55 hover:bg-white/[0.04] hover:text-white/80"
            }`}
            onClick={() => setTab("receipts")}
          >
            Receipts
          </button>
        </div>

        {tab === "daily" ? (
          <JobDailyLogsTab
            jobId={jobId}
            jobName={`${job.job_number} · ${job.job_name}`}
            projectBreakdownHref={projectBreakdownHref}
          />
        ) : null}

        {tab === "receipts" ? (
          <JobReceiptsTab
            jobId={jobId}
            jobLabel={`${job.job_number} · ${job.job_name}`}
          />
        ) : null}

        {tab === "overview" ? (
          <>
            <div className="mt-8 lg:grid lg:grid-cols-5 lg:gap-6">
              <div className="flex flex-col gap-6 lg:col-span-3">
                <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">
                    Job details
                  </h2>
                  <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm lg:grid-cols-2">
                    {job.job_number?.trim() ? (
                      <div className="grid grid-cols-[minmax(0,7rem)_1fr] items-baseline gap-x-2 gap-y-0.5">
                        <dt className="text-white/45">Job number</dt>
                        <dd className="text-white">{job.job_number}</dd>
                      </div>
                    ) : null}
                    {job.job_type?.trim() ? (
                      <div className="grid grid-cols-[minmax(0,7rem)_1fr] items-baseline gap-x-2 gap-y-0.5">
                        <dt className="text-white/45">Job type</dt>
                        <dd className="text-white">{job.job_type}</dd>
                      </div>
                    ) : null}
                    {job.status?.trim() ? (
                      <div className="grid grid-cols-[minmax(0,7rem)_1fr] items-baseline gap-x-2 gap-y-0.5">
                        <dt className="text-white/45">Status</dt>
                        <dd className="text-white">{job.status}</dd>
                      </div>
                    ) : null}
                    {[job.address, job.city, job.state, job.zip].some(Boolean) ? (
                      <div className="grid grid-cols-[minmax(0,7rem)_1fr] items-baseline gap-x-2 gap-y-0.5 lg:col-span-2">
                        <dt className="text-white/45">Address</dt>
                        <dd className="text-white">
                          {[job.address, job.city, job.state, job.zip]
                            .filter(Boolean)
                            .join(", ")}
                        </dd>
                      </div>
                    ) : null}
                    {job.description?.trim() ? (
                      <div className="grid grid-cols-[minmax(0,7rem)_1fr] items-baseline gap-x-2 gap-y-0.5 lg:col-span-2">
                        <dt className="text-white/45">Description</dt>
                        <dd className="text-white">{job.description}</dd>
                      </div>
                    ) : null}
                    {job.notes?.trim() ? (
                      <div className="grid grid-cols-[minmax(0,7rem)_1fr] items-baseline gap-x-2 gap-y-0.5 lg:col-span-2">
                        <dt className="text-white/45">Notes</dt>
                        <dd className="text-white">{job.notes}</dd>
                      </div>
                    ) : null}
                  </dl>
                </section>

                <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">
                    Status history
                  </h2>
                  {invoiceStatusHistory.length === 0 ? (
                    <p className="mt-3 text-sm text-white/45">
                      No history yet
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-2">
                      {invoiceStatusHistory.map((row) => (
                        <li
                          key={row.id}
                          className="text-sm leading-relaxed text-white/85"
                        >
                          {row.changerName} changed invoice status from{" "}
                          {formatInvoiceHistValue(row.old_value)} to{" "}
                          {formatInvoiceHistValue(row.new_value)} on{" "}
                          {new Date(row.changed_at).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">
                    Attached items
                  </h2>
                  {attachments.length === 0 ? (
                    <p className="mt-3 text-sm text-white/45">
                      No attachments yet.
                    </p>
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
              </div>

              <div className="mt-6 flex flex-col gap-6 lg:col-span-2 lg:mt-0">
                <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">
                    Assigned crew
                  </h2>
                  {crewAssignments.length === 0 ? (
                    <p className="mt-3 text-sm text-white/45">
                      No crew assigned yet.
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {crewAssignments.map((row) => {
                        const prof = Array.isArray(row.user_profiles)
                          ? row.user_profiles[0]
                          : row.user_profiles;
                        const name = !prof
                          ? "Crew member"
                          : (() => {
                              const n = userDisplayName({
                                first_name: prof.first_name,
                                last_name: prof.last_name,
                                full_name: prof.full_name,
                                email: prof.email,
                              });
                              return n === "—" ? "Crew member" : n;
                            })();
                        const roleLabel = formatRole(prof?.role ?? null);
                        return (
                          <li
                            key={row.user_id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/8 bg-[#0a1628]/60 px-3 py-3"
                          >
                            <div>
                              <p className="text-sm font-medium text-white">
                                {name}
                              </p>
                              <p className="text-xs text-white/55">
                                {roleLabel}
                              </p>
                            </div>
                            {canAccessFinancialTools ? (
                              <button
                                type="button"
                                onClick={() => void removeCrewMember(row.user_id)}
                                className="rounded-lg border border-red-500/35 px-3 py-1.5 text-sm text-red-200 hover:bg-red-950/40"
                              >
                                Remove
                              </button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {canAccessFinancialTools ? (
                    <>
                      {!showCrewAssignForm ? (
                        <button
                          type="button"
                          onClick={() => void openCrewAssignForm()}
                          className="mt-4 rounded-lg border border-white/10 bg-[#0a1628]/60 px-3 py-2 text-sm text-white hover:bg-white/[0.06]"
                        >
                          Assign crew member
                        </button>
                      ) : (
                        <form
                          onSubmit={(e) => void submitCrewAssignment(e)}
                          className="mt-4 space-y-3 rounded-lg border border-white/8 bg-[#0a1628]/60 p-3"
                        >
                          <label className="block text-sm text-white/80">
                            <span className="text-white/55">Employee</span>
                            <select
                              required
                              value={selectedCrewUserId}
                              disabled={
                                crewAssignmentUsersLoading || crewAssigning
                              }
                              onChange={(e) =>
                                setSelectedCrewUserId(e.target.value)
                              }
                              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0a1628] px-3 py-2 text-sm text-white focus:border-[#E8C84A]/40 focus:outline-none disabled:opacity-50"
                            >
                              <option
                                value=""
                                className="bg-[#0a1628] text-white"
                              >
                                {crewAssignmentUsersLoading
                                  ? "Loading…"
                                  : "Select an employee…"}
                              </option>
                              {crewAssignmentUsers
                                .filter(
                                  (u) =>
                                    !crewAssignments.some(
                                      (c) => c.user_id === u.id,
                                    ),
                                )
                                .map((u) => (
                                  <option
                                    key={u.id}
                                    value={u.id}
                                    className="bg-[#0a1628] text-white"
                                  >
                                    {userAssigneeOptionLabel(u) +
                                      (u.role ? ` (${u.role})` : "")}
                                  </option>
                                ))}
                            </select>
                          </label>
                          {crewAssignError ? (
                            <p className="text-sm text-red-300">
                              {crewAssignError}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              disabled={
                                crewAssigning ||
                                crewAssignmentUsersLoading ||
                                !selectedCrewUserId
                              }
                              className="rounded-lg border border-[#E8C84A]/45 px-3 py-2 text-sm font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/10 disabled:opacity-40"
                            >
                              {crewAssigning ? "Saving…" : "Add to job"}
                            </button>
                            <button
                              type="button"
                              disabled={crewAssigning}
                              onClick={() => {
                                setShowCrewAssignForm(false);
                                setSelectedCrewUserId("");
                                setCrewAssignError(null);
                              }}
                              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/[0.06] disabled:opacity-40"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </>
                  ) : null}
                </section>

                <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">
                    Customer
                  </h2>
                  {customer ? (
                    <div className="mt-3 text-sm text-white/85">
                      <p className="font-medium">
                        {customer.company_name || "—"}
                      </p>
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
                    <p className="mt-3 text-sm text-white/45">
                      No customer linked.
                    </p>
                  )}
                </section>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
