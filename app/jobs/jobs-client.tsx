"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
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

type JobFormState = {
  job_name: string;
  customer_id: string;
  job_type: (typeof JOB_TYPES)[number];
  status: (typeof JOB_STATUSES)[number];
  address: string;
  description: string;
  notes: string;
};

const emptyJobForm: JobFormState = {
  job_name: "",
  customer_id: "",
  job_type: JOB_TYPES[0]!,
  status: JOB_STATUSES[0]!,
  address: "",
  description: "",
  notes: "",
};

export function JobsClient() {
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
  const [toastMsg, setToastMsg] = useState<string | null>(null);
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
          "id,job_name,job_number,status,job_type,address,city,state,zip,description,notes,updated_at,customer_id, customers(company_name,contact_name)",
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
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (modalOpen) void loadCustomers();
  }, [modalOpen, loadCustomers]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 3200);
    return () => window.clearTimeout(t);
  }, [toastMsg]);

  const customerLabel = (j: JobListRow) => {
    const raw = j.customers;
    const c = Array.isArray(raw) ? raw[0] : raw;
    if (!c) return "—";
    return c.company_name || c.contact_name || "—";
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
        setToastMsg("Job updated.");
      } else {
        const { error: ie } = await sb.from("jobs").insert(payload);
        if (ie) throw ie;
        setToastMsg("Job saved.");
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
      setToastMsg("Job deleted.");
      void load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const JobCard = ({ j }: { j: JobListRow }) => (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] text-sm transition-colors hover:border-[#E8C84A]/45">
      <Link href={`/jobs/${j.id}`} className="block p-3">
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
      <div className="flex flex-wrap gap-2 border-t border-white/10 px-3 py-2">
        <button
          type="button"
          onClick={() => openEdit(j)}
          className="rounded-md border border-white/20 px-2 py-1 text-[11px] font-semibold text-white/90 hover:bg-white/10"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setDeleteTarget(j)}
          className="rounded-md border border-red-500/35 px-2 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-950/35"
        >
          Delete
        </button>
        {j.customer_id ? (
          <Link
            href={`/customers/${j.customer_id}`}
            className="rounded-md border border-[#E8C84A]/40 px-2 py-1 text-[11px] font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/10"
          >
            Customer
          </Link>
        ) : (
          <Link
            href="/customers"
            className="rounded-md border border-white/20 px-2 py-1 text-[11px] font-semibold text-white/70 hover:bg-white/10"
          >
            Link customer
          </Link>
        )}
      </div>
    </div>
  );

  const inp =
    "mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-sm text-white";

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="jobs" showTppSubtitle />
      {toastMsg ? (
        <div
          className="fixed bottom-6 right-6 z-[250] max-w-sm rounded-xl border border-emerald-500/40 bg-emerald-950/95 px-4 py-3 text-sm font-medium text-emerald-100 shadow-lg"
          role="status"
        >
          {toastMsg}
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold text-white">Jobs</h1>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-[#E8C84A] px-6 py-3 text-base font-bold text-[#0a1628] shadow-md hover:bg-[#f0d56e]"
            >
              <span className="text-xl leading-none" aria-hidden>
                +
              </span>
              Add Job
            </button>
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
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
              className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
                view === "list"
                  ? "bg-[#E8C84A] text-[#0a1628]"
                  : "border border-white/20 text-white/80"
              }`}
            >
              List
            </button>
            <Link
              href="/customers"
              className="rounded-lg border border-white/20 px-4 py-2.5 text-sm text-white/85 hover:bg-white/5"
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
            No jobs yet. Add one above or link a tool result from a job dialog.
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
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                Delete
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-white/20 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5"
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
                className="rounded-lg bg-[#E8C84A] px-4 py-2.5 text-sm font-semibold text-[#0a1628] disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-white/20 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5"
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
