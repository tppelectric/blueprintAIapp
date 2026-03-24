"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { WideAppHeader } from "@/components/wide-app-header";
import { createBrowserClient } from "@/lib/supabase/client";
import type { CustomerRow } from "@/lib/jobs-types";

type Row = CustomerRow & { job_count?: number };

const emptyForm = {
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  notes: "",
};

export function CustomersClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = createBrowserClient();
      const { data: cust, error: ce } = await sb
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (ce) throw ce;
      const { data: jobs } = await sb.from("jobs").select("id,customer_id");
      const byC: Record<string, number> = {};
      for (const j of jobs ?? []) {
        const cid = (j as { customer_id: string | null }).customer_id;
        if (cid) byC[cid] = (byC[cid] ?? 0) + 1;
      }
      setRows(
        (cust ?? []).map((c) => ({
          ...(c as CustomerRow),
          job_count: byC[(c as CustomerRow).id] ?? 0,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 3200);
    return () => window.clearTimeout(t);
  }, [toastMsg]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormMsg(null);
    setModalOpen(true);
  };

  const openEdit = (c: CustomerRow) => {
    setEditingId(c.id);
    setForm({
      company_name: c.company_name ?? "",
      contact_name: c.contact_name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      zip: c.zip ?? "",
      notes: c.notes ?? "",
    });
    setFormMsg(null);
    setModalOpen(true);
  };

  const saveCustomer = async () => {
    setSaving(true);
    setFormMsg(null);
    try {
      const sb = createBrowserClient();
      const payload = {
        company_name: form.company_name.trim() || null,
        contact_name: form.contact_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip: form.zip.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editingId) {
        const { error: ue } = await sb
          .from("customers")
          .update(payload)
          .eq("id", editingId);
        if (ue) throw ue;
        setToastMsg("Customer updated.");
      } else {
        const { error: ie } = await sb.from("customers").insert(payload);
        if (ie) throw ie;
        setToastMsg("Customer saved.");
      }
      setModalOpen(false);
      void load();
    } catch (e) {
      setFormMsg(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteCustomer = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const sb = createBrowserClient();
      const { error: de } = await sb
        .from("customers")
        .delete()
        .eq("id", deleteTarget.id);
      if (de) throw de;
      setDeleteTarget(null);
      setToastMsg("Customer deleted.");
      void load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const inp =
    "mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-sm text-white";

  const escapeCsvField = (v: string) => {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const exportJobTreadCsv = () => {
    const headers = [
      "Company Name",
      "Contact Name",
      "Email",
      "Phone",
      "Address",
      "City",
      "State",
      "Zip",
      "Notes",
    ];
    const lines = rows.map((c) =>
      [
        c.company_name ?? "",
        c.contact_name ?? "",
        c.email ?? "",
        c.phone ?? "",
        c.address ?? "",
        c.city ?? "",
        c.state ?? "",
        c.zip ?? "",
        c.notes ?? "",
      ]
        .map(escapeCsvField)
        .join(","),
    );
    const bom = "\uFEFF";
    const blob = new Blob(
      [bom + headers.map(escapeCsvField).join(",") + "\n" + lines.join("\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jobtread-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="customers" showTppSubtitle />
      {toastMsg ? (
        <div
          className="fixed bottom-20 left-4 right-4 z-[250] mx-auto max-w-sm rounded-xl border border-emerald-500/40 bg-emerald-950/95 px-4 py-3 text-sm font-medium text-emerald-100 shadow-lg sm:bottom-6 sm:left-auto sm:right-6"
          role="status"
        >
          {toastMsg}
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">
            Customers
          </h1>
          <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#E8C84A] px-6 py-3 text-base font-bold text-[#0a1628] shadow-md hover:bg-[#f0d56e] sm:w-auto"
            >
              <span className="text-xl leading-none" aria-hidden>
                +
              </span>
              Add Customer
            </button>
            <Link
              href="/jobs"
              className="flex min-h-[44px] w-full items-center justify-center rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium text-[#E8C84A] hover:bg-white/5 sm:w-auto"
            >
              Jobs →
            </Link>
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={exportJobTreadCsv}
              className="min-h-[44px] w-full rounded-lg border border-[#E8C84A]/50 px-4 py-2.5 text-sm font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/10 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              Export for JobTread
            </button>
          </div>
        </div>
        {loading ? (
          <p className="mt-10 text-white/60">Loading…</p>
        ) : error ? (
          <p className="mt-10 text-red-200">{error}</p>
        ) : rows.length === 0 ? (
          <p className="mt-10 text-white/55">No customers yet.</p>
        ) : (
          <ul className="mt-8 space-y-3">
            {rows.map((c) => (
              <li
                key={c.id}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] p-3 sm:p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                  <Link
                    href={`/customers/${c.id}`}
                    className="min-w-0 flex-1 hover:text-[#E8C84A]"
                  >
                    <p className="font-semibold text-white">
                      {c.company_name || c.contact_name || "Customer"}
                    </p>
                    <p className="text-xs text-white/55 sm:text-sm">
                      <span className="block sm:inline">{c.phone}</span>
                      <span className="hidden sm:inline"> · </span>
                      <span className="block sm:inline">{c.email}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-white/40 sm:mt-1 sm:text-xs">
                      {c.job_count ?? 0} job
                      {(c.job_count ?? 0) === 1 ? "" : "s"}
                    </p>
                  </Link>
                  <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(c)}
                      className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-950/40"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-cust-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-xl">
            <h2
              id="delete-cust-title"
              className="text-lg font-semibold text-white"
            >
              Delete customer?
            </h2>
            <p className="mt-3 text-sm text-white/70">
              Remove{" "}
              <strong className="text-white">
                {deleteTarget.company_name ||
                  deleteTarget.contact_name ||
                  "this record"}
              </strong>
              ? Linked jobs may keep a null customer reference.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDeleteCustomer()}
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
          aria-labelledby="cust-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-xl">
            <h2 id="cust-modal-title" className="text-lg font-semibold text-white">
              {editingId ? "Edit customer" : "Add customer"}
            </h2>
            {formMsg ? (
              <p className="mt-2 text-sm text-amber-200">{formMsg}</p>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="text-white/70">Company name</span>
                <input
                  className={inp}
                  value={form.company_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, company_name: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-white/70">Contact name</span>
                <input
                  className={inp}
                  value={form.contact_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contact_name: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Email</span>
                <input
                  type="email"
                  className={inp}
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Phone</span>
                <input
                  className={inp}
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-white/70">Address</span>
                <input
                  className={inp}
                  value={form.address}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">City</span>
                <input
                  className={inp}
                  value={form.city}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, city: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">State</span>
                <input
                  className={inp}
                  value={form.state}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, state: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-white/70">Zip</span>
                <input
                  className={inp}
                  value={form.zip}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, zip: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="text-white/70">Notes</span>
                <textarea
                  className={inp + " min-h-[80px]"}
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
                onClick={() => void saveCustomer()}
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
