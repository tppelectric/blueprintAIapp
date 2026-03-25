"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  JobListSkeleton,
} from "@/components/app-polish";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  JOB_STATUSES,
  JOB_TYPES,
  type CustomerRow,
  type JobListRow,
} from "@/lib/jobs-types";

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

function escapeCsvField(v: string): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function jobCustomerExportName(j: JobListRow): string {
  const raw = j.customers;
  const c = Array.isArray(raw) ? raw[0] : raw;
  if (!c) return "";
  return String(c.company_name || c.contact_name || "").trim();
}

function formatCreatedDateForCsv(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function downloadCsv(filename: string, headerRow: string, bodyLines: string[]) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + headerRow + "\n" + bodyLines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type JobFormState = {
  job_name: string;
  customer_id: string;
  assigned_user_id: string;
  job_type: (typeof JOB_TYPES)[number];
  status: (typeof JOB_STATUSES)[number];
  address: string;
  description: string;
  notes: string;
};

type AssigneeOption = {
  id: string;
  email: string;
  full_name: string;
};

const emptyJobForm: JobFormState = {
  job_name: "",
  customer_id: "",
  assigned_user_id: "",
  job_type: JOB_TYPES[0]!,
  status: JOB_STATUSES[0]!,
  address: "",
  description: "",
  notes: "",
};

export function JobsClient() {
  const { showToast } = useAppToast();
  const {
    canCreateOrEditJobs,
    canDeleteJobs,
    canAssignJobs,
  } = useUserRole();
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [jobs, setJobs] = useState<JobListRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<JobFormState>(emptyJobForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<JobListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCustomers = useCallback(async () => {
    try {
      const sb = createBrowserClient();
      const { data, error: ce } = await sb
        .from("customers")
        .select("id,company_name,contact_name,email")
        .order("created_at", { ascending: false });
      if (ce) throw ce;
      setCustomers((data ?? []) as CustomerRow[]);
    } catch {
      setCustomers([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createBrowserClient();
      const { data, error: qe } = await sb
        .from("jobs")
        .select(
          "id,job_name,job_number,status,job_type,address,city,state,zip,description,notes,created_at,updated_at,customer_id,assigned_user_id, customers(company_name,contact_name)",
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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      if (mq.matches) setView("list");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (modalOpen) void loadCustomers();
  }, [modalOpen, loadCustomers]);

  useEffect(() => {
    if (!modalOpen || !canAssignJobs) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/users/for-assignment", {
          credentials: "include",
        });
        const j = (await r.json()) as {
          users?: AssigneeOption[];
        };
        if (!cancelled && r.ok && j.users) setAssignees(j.users);
      } catch {
        if (!cancelled) setAssignees([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, canAssignJobs]);

  const customerLabel = (j: JobListRow) => {
    const raw = j.customers;
    const c = Array.isArray(raw) ? raw[0] : raw;
    if (!c) return "—";
    return c.company_name || c.contact_name || "—";
  };

  const exportJobTreadCsv = () => {
    const headers = [
      "Job Name",
      "Job Number",
      "Customer Name",
      "Status",
      "Job Type",
      "Address",
      "City",
      "State",
      "Zip",
      "Description",
      "Notes",
      "Created Date",
    ];
    const lines = jobs.map((j) =>
      [
        j.job_name,
        j.job_number,
        jobCustomerExportName(j),
        j.status,
        j.job_type,
        j.address ?? "",
        j.city ?? "",
        j.state ?? "",
        j.zip ?? "",
        j.description ?? "",
        j.notes ?? "",
        formatCreatedDateForCsv(j.created_at),
      ]
        .map(escapeCsvField)
        .join(","),
    );
    downloadCsv(
      `jobtread-jobs-${new Date().toISOString().slice(0, 10)}.csv`,
      headers.map(escapeCsvField).join(","),
      lines,
    );
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyJobForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (j: JobListRow) => {
    setEditingId(j.id);
    const addrLine = [j.address, j.city, j.state, j.zip]
      .filter((x) => x != null && String(x).trim() !== "")
      .join(", ");
    setForm({
      job_name: j.job_name,
      customer_id: j.customer_id ?? "",
      assigned_user_id: j.assigned_user_id ?? "",
      job_type: (JOB_TYPES as readonly string[]).includes(j.job_type)
        ? (j.job_type as (typeof JOB_TYPES)[number])
        : JOB_TYPES[0]!,
      status: (JOB_STATUSES as readonly string[]).includes(j.status)
        ? (j.status as (typeof JOB_STATUSES)[number])
        : JOB_STATUSES[0]!,
      address: addrLine,
      description: j.description ?? "",
      notes: j.notes ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const saveJob = async () => {
    const name = form.job_name.trim();
    if (!name) {
      setFormError("Enter a job name.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const sb = createBrowserClient();
      const addrParts = form.address.split(",").map((s) => s.trim());
      const address = addrParts[0] || null;
      const city = addrParts[1] || null;
      const state = addrParts[2] || null;
      const zip = addrParts[3] || null;

      const payload = {
        job_name: name,
        customer_id: form.customer_id || null,
        assigned_user_id: form.assigned_user_id.trim() || null,
        job_type: form.job_type,
        status: form.status,
        address,
        city,
        state,
        zip,
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
      };

      if (editingId) {
        const { error: ue } = await sb
          .from("jobs")
          .update(payload)
          .eq("id", editingId);
        if (ue) throw ue;
        showToast({ message: "Job updated.", variant: "success" });
      } else {
        const { error: ie } = await sb.from("jobs").insert(payload);
        if (ie) throw ie;
        showToast({ message: "Job saved.", variant: "success" });
      }
      setModalOpen(false);
      void load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteJob = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const sb = createBrowserClient();
      const { error: de } = await sb
        .from("jobs")
        .delete()
        .eq("id", deleteTarget.id);
      if (de) throw de;
      setDeleteTarget(null);
      showToast({ message: "Job deleted.", variant: "success" });
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Delete failed.",
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  const JobCard = ({ j }: { j: JobListRow }) => (
    <div className="app-card w-full !p-0 text-sm transition-colors hover:border-[#E8C84A]/45">
      <Link href={`/jobs/${j.id}`} className="block p-4">
        <p className="text-base font-semibold text-white">
          {j.job_number} · {j.job_name}
        </p>
        <p className="app-muted mt-0.5 sm:mt-1">
          {customerLabel(j)}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1 sm:mt-2">
          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-200">
            {j.job_type}
          </span>
          <span className="rounded-full bg-[#E8C84A]/15 px-2 py-0.5 text-[10px] text-[#E8C84A]">
            {j.status}
          </span>
        </div>
        {[j.address, j.city, j.state].filter(Boolean).length ? (
          <p className="app-muted mt-1.5 hidden sm:mt-2 sm:block">
            {[j.address, j.city, j.state, j.zip].filter(Boolean).join(", ")}
          </p>
        ) : null}
        <p className="app-muted mt-1.5 sm:mt-2">
          {counts[j.id] ?? 0} att. · {formatDate(j.updated_at)}
        </p>
      </Link>
      <div className="flex flex-wrap gap-2 border-t border-white/12 px-4 py-3">
        {canCreateOrEditJobs ? (
          <button
            type="button"
            onClick={() => openEdit(j)}
            className="btn-secondary !h-9 min-h-0 !px-3 !text-xs"
          >
            Edit
          </button>
        ) : null}
        {canDeleteJobs ? (
          <button
            type="button"
            onClick={() => setDeleteTarget(j)}
            className="btn-danger-outline !h-9 min-h-0 !px-3 !text-xs"
          >
            Delete
          </button>
        ) : null}
        {j.customer_id ? (
          <Link
            href={`/customers/${j.customer_id}`}
            className="btn-secondary !h-9 min-h-0 !px-3 !text-xs text-[#E8C84A]"
          >
            Customer
          </Link>
        ) : (
          <Link
            href="/customers"
            className="btn-secondary !h-9 min-h-0 !px-3 !text-xs"
          >
            Link customer
          </Link>
        )}
      </div>
    </div>
  );

  const inp = "app-input";

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="jobs" showTppSubtitle />
      <main className="app-page-shell flex-1 py-8 md:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <h1 className="text-2xl font-semibold text-white">
            Jobs
          </h1>
          <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {canCreateOrEditJobs ? (
              <button
                type="button"
                onClick={openCreate}
                className="btn-primary btn-h-11 inline-flex w-full items-center justify-center gap-2 sm:w-auto"
              >
                <span className="text-lg leading-none" aria-hidden>
                  +
                </span>
                Add job
              </button>
            ) : null}
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={`min-h-[2.75rem] rounded-lg px-4 text-sm font-semibold ${
                view === "kanban"
                  ? "inline-flex h-11 items-center justify-center bg-[#E8C84A] text-[#0a1628]"
                  : "btn-secondary btn-h-11"
              }`}
            >
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`min-h-[2.75rem] rounded-lg px-4 text-sm font-semibold ${
                view === "list"
                  ? "inline-flex h-11 items-center justify-center bg-[#E8C84A] text-[#0a1628]"
                  : "btn-secondary btn-h-11"
              }`}
            >
              List
            </button>
            </div>
            <Link
              href="/customers"
              className="btn-secondary btn-h-11 w-full justify-center sm:w-auto"
            >
              Customers
            </Link>
            <Link
              href="/jobs/daily-logs"
              className="btn-secondary btn-h-11 w-full justify-center border-[#E8C84A]/35 text-[#E8C84A] hover:border-[#E8C84A]/50 sm:w-auto"
            >
              Daily logs
            </Link>
            <button
              type="button"
              disabled={jobs.length === 0}
              onClick={exportJobTreadCsv}
              className="btn-secondary btn-h-11 w-full border-[#E8C84A]/45 text-[#E8C84A] hover:border-[#E8C84A]/60 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              Export for JobTread
            </button>
          </div>
        </div>

        {loading ? (
          <JobListSkeleton />
        ) : error ? (
          <p className="app-body mt-6 text-red-200">{error}</p>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden>📋</span>}
            title="No jobs yet — create your first"
            description="Add a job to track leads, quotes, and field work. You can also link tool results from a job dialog."
            actionLabel={canCreateOrEditJobs ? "Add job" : undefined}
            onAction={canCreateOrEditJobs ? openCreate : undefined}
          />
        ) : view === "list" ? (
          <ul className="space-y-3">
            {jobs.map((j) => (
              <li key={j.id}>
                <JobCard j={j} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4 [-webkit-overflow-scrolling:touch]">
            {KANBAN_STATUSES.map((st) => (
              <div
                key={st}
                className="app-card app-card-pad-lg w-[min(100vw-2rem,18rem)] shrink-0 sm:w-72"
              >
                <h2 className="app-muted mb-3 font-semibold uppercase tracking-wide text-[#E8C84A]/90">
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

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-job-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-xl">
            <h2
              id="delete-job-title"
              className="text-lg font-semibold text-white"
            >
              Delete job?
            </h2>
            <p className="mt-3 text-sm text-white/70">
              Permanently remove{" "}
              <strong className="text-white">
                {deleteTarget.job_number} · {deleteTarget.job_name}
              </strong>
              ? This cannot be undone.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDeleteJob()}
                className="btn-danger-outline disabled:opacity-50"
              >
                Delete
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="btn-secondary disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-xl">
            <h2 id="job-modal-title" className="text-lg font-semibold text-white">
              {editingId ? "Edit job" : "Add job"}
            </h2>
            {formError ? (
              <p className="mt-2 text-sm text-red-200">{formError}</p>
            ) : null}
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-white/70">Job name</span>
                <input
                  className={inp}
                  value={form.job_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, job_name: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Customer</span>
                <select
                  className={inp}
                  value={form.customer_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customer_id: e.target.value }))
                  }
                >
                  <option value="">— None —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name || c.contact_name || c.email || c.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </label>
              {canAssignJobs ? (
                <label className="block text-sm">
                  <span className="text-white/70">Assigned field tech</span>
                  <select
                    className={inp}
                    value={form.assigned_user_id}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        assigned_user_id: e.target.value,
                      }))
                    }
                  >
                    <option value="">— Unassigned —</option>
                    {assignees.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name?.trim()
                          ? `${u.full_name} (${u.email})`
                          : u.email}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-white/70">Job type</span>
                  <select
                    className={inp}
                    value={form.job_type}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        job_type: e.target.value as (typeof JOB_TYPES)[number],
                      }))
                    }
                  >
                    {JOB_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-white/70">Status</span>
                  <select
                    className={inp}
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        status: e.target.value as (typeof JOB_STATUSES)[number],
                      }))
                    }
                  >
                    {JOB_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-white/70">
                  Address (street, city, state, zip — comma separated)
                </span>
                <input
                  className={inp}
                  value={form.address}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
                  }
                  placeholder="123 Main St, Brooklyn, NY, 11201"
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Description</span>
                <textarea
                  className={inp + " min-h-[72px]"}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Notes</span>
                <textarea
                  className={inp + " min-h-[72px]"}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveJob()}
                className="btn-primary disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
