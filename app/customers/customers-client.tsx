"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CustomerListSkeleton,
  EmptyState,
} from "@/components/app-polish";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
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
  const { showToast } = useAppToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");

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

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) =>
      [c.company_name, c.contact_name, c.phone, c.email]
        .some((v) => v?.toLowerCase().includes(q)),
    );
  }, [rows, search]);

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
        showToast({ message: "Customer updated.", variant: "success" });
      } else {
        const { error: ie } = await sb.from("customers").insert(payload);
        if (ie) throw ie;
        showToast({ message: "Customer saved.", variant: "success" });
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
      showToast({ message: "Customer deleted.", variant: "success" });
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

  const inp = "app-input";

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
      <main className="app-page-shell max-w-6xl flex-1 py-8 md:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <h1 className="text-2xl font-semibold text-white">
            Customers
          </h1>
          <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={openCreate}
              className="btn-primary btn-h-11 inline-flex w-full items-center justify-center gap-2 sm:w-auto"
            >
              <span className="text-lg leading-none" aria-hidden>
                +
              </span>
              Add customer
            </button>
            <Link
              href="/jobs"
              className="btn-secondary btn-h-11 w-full justify-center sm:w-auto"
            >
              Jobs →
            </Link>
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={exportJobTreadCsv}
              className="btn-secondary btn-h-11 w-full border-[#E8C84A]/45 text-[#E8C84A] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              Export for JobTread
            </button>
          </div>
        </div>
        {!loading && rows.length > 0 ? (
          <div className="mt-4">
            <input
              type="search"
              className="app-input w-full max-w-md"
              placeholder="Search by company, contact, phone, or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        ) : null}
        {!loading && rows.length > 0 ? (
          <p className="mt-2 text-xs text-white/40">
            {filteredRows.length} of {rows.length} customer
            {rows.length === 1 ? "" : "s"}
          </p>
        ) : null}
        {loading ? (
          <CustomerListSkeleton />
        ) : error ? (
          <p className="app-body mt-6 text-red-200">{error}</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<span aria-hidden>👤</span>}
            title="No customers yet"
            description="Add customers to link jobs, quotes, and export to JobTread."
            actionLabel="Add customer"
            onAction={openCreate}
          />
        ) : (
          <ul className="space-y-3">
            {filteredRows.map((c) => (
              <li
                key={c.id}
                className="app-card app-card-pad-lg w-full"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                  <Link
                    href={`/customers/${c.id}`}
                    className="min-w-0 flex-1 hover:text-[#E8C84A]"
                  >
                    <p className="text-base font-semibold text-white">
                      {c.company_name || c.contact_name || "Customer"}
                    </p>
                    <p className="app-body mt-0.5">
                      <span className="block sm:inline">{c.phone}</span>
                      <span className="hidden sm:inline"> · </span>
                      <span className="block sm:inline">{c.email}</span>
                    </p>
                    <p className="app-muted mt-0.5 sm:mt-1">
                      {c.job_count ?? 0} job
                      {(c.job_count ?? 0) === 1 ? "" : "s"}
                    </p>
                  </Link>
                  <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="btn-secondary !h-9 min-h-0 !px-3 !text-xs"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(c)}
                      className="btn-danger-outline !h-9 min-h-0 !px-3 !text-xs"
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
