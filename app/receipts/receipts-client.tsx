"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, ReceiptListSkeleton } from "@/components/app-polish";
import { ReceiptCapture } from "@/components/receipt-capture";
import { WideAppHeader } from "@/components/wide-app-header";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import {
  RECEIPT_CATEGORIES,
  displayProfileName,
  formatReceiptCurrency,
  type ReceiptCategory,
  type ReceiptRow,
} from "@/lib/receipts-types";
import { parseReceiptRow } from "@/lib/receipts-parse";
import { canManageReceiptsAdmin } from "@/lib/user-roles";
import { createBrowserClient } from "@/lib/supabase/client";

type TabKey = "all" | "unassigned" | "by_job" | "mine";

type JobOpt = {
  id: string;
  label: string;
  addressLine: string;
};

function formatJobAddress(j: Record<string, unknown>): string {
  const parts = [j.address, j.city, j.state, j.zip]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

type ProfileLite = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
};

function formatJobLabel(j: {
  job_number?: string | null;
  job_name?: string | null;
}): string {
  const a = String(j.job_number ?? "").trim();
  const b = String(j.job_name ?? "").trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || "—";
}

export function ReceiptsClient() {
  const { showToast } = useAppToast();
  const { role, profile } = useUserRole();
  const isAdmin = canManageReceiptsAdmin(role);
  const myId = profile?.id ?? null;

  const [tab, setTab] = useState<TabKey>("all");
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [jobs, setJobs] = useState<JobOpt[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [assignJob, setAssignJob] = useState("");
  const [editing, setEditing] = useState<ReceiptRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createBrowserClient();

      const { data: recData, error: re } = await sb
        .from("receipts")
        .select("*")
        .order("created_at", { ascending: false });
      if (re) throw re;
      const rows = (recData ?? []).map((x) =>
        parseReceiptRow(x as Record<string, unknown>),
      );
      setReceipts(rows);

      const { data: jd } = await sb
        .from("jobs")
        .select("id,job_name,job_number,address,city,state,zip")
        .order("updated_at", { ascending: false })
        .limit(400);
      setJobs(
        (jd ?? []).map((j) => {
          const rec = j as Record<string, unknown>;
          return {
            id: j.id as string,
            label: formatJobLabel(rec),
            addressLine: formatJobAddress(rec),
          };
        }),
      );

      const uids = [...new Set(rows.map((r) => r.uploaded_by))];
      const pmap: Record<string, ProfileLite> = {};
      if (uids.length) {
        const { data: profs } = await sb
          .from("user_profiles")
          .select("id,first_name,last_name,full_name,email")
          .in("id", uids);
        for (const p of profs ?? []) {
          const o = p as ProfileLite;
          pmap[o.id] = o;
        }
      }
      setProfiles(pmap);

      const nextThumbs: Record<string, string> = {};
      for (const r of rows) {
        const { data: signed } = await sb.storage
          .from("job-receipts")
          .createSignedUrl(r.storage_path, 3600);
        if (signed?.signedUrl) nextThumbs[r.id] = signed.signedUrl;
      }
      setThumbs(nextThumbs);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Load failed.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const unassignedCount = useMemo(
    () => receipts.filter((r) => !r.job_id).length,
    [receipts],
  );

  const filtered = useMemo(() => {
    if (tab === "unassigned")
      return receipts.filter((r) => !r.job_id);
    if (tab === "mine")
      return myId
        ? receipts.filter((r) => r.uploaded_by === myId)
        : [];
    if (tab === "by_job") return [];
    return receipts;
  }, [receipts, tab, myId]);

  const jobStatsById = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    for (const r of receipts) {
      if (!r.job_id) continue;
      const cur = m.get(r.job_id) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(r.total_amount) || 0;
      m.set(r.job_id, cur);
    }
    return m;
  }, [receipts]);

  const jobReceiptGroups = useMemo(() => {
    const map = new Map<string, ReceiptRow[]>();
    for (const r of receipts) {
      if (!r.job_id) continue;
      const arr = map.get(r.job_id) ?? [];
      arr.push(r);
      map.set(r.job_id, arr);
    }
    const list = [...map.entries()].map(([jobId, rows]) => {
      const jm = jobs.find((j) => j.id === jobId);
      const total = rows.reduce(
        (s, r) => s + (Number(r.total_amount) || 0),
        0,
      );
      const byCat: Record<string, number> = {};
      for (const r of rows) {
        const c = r.receipt_category;
        byCat[c] = (byCat[c] ?? 0) + (Number(r.total_amount) || 0);
      }
      return { jobId, rows, jm, total, byCat };
    });
    list.sort((a, b) => b.total - a.total);
    return list;
  }, [receipts, jobs]);

  const assignToJob = async () => {
    if (!assignId || !assignJob) return;
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("receipts")
        .update({ job_id: assignJob })
        .eq("id", assignId);
      if (error) {
        const bits = [
          error.message,
          error.code ? `code ${error.code}` : null,
          error.details ? String(error.details) : null,
        ].filter(Boolean);
        throw new Error(bits.join(" — "));
      }
      showToast({ message: "Job assigned.", variant: "success" });
      setAssignId(null);
      setAssignJob("");
      void load();
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not assign.",
        variant: "error",
      });
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const sb = createBrowserClient();
      const { error } = await sb
        .from("receipts")
        .update({
          vendor_name: editing.vendor_name,
          receipt_date: editing.receipt_date,
          total_amount: editing.total_amount,
          receipt_category: editing.receipt_category,
          job_id: editing.job_id,
          notes: editing.notes,
          tax_amount: editing.tax_amount,
          subtotal: editing.subtotal,
        })
        .eq("id", editing.id);
      if (error) throw error;
      showToast({ message: "Receipt updated.", variant: "success" });
      setEditing(null);
      void load();
    } catch {
      showToast({ message: "Update failed.", variant: "error" });
    }
  };

  const deleteReceipt = async (r: ReceiptRow) => {
    if (!window.confirm("Delete this receipt permanently?")) return;
    try {
      const sb = createBrowserClient();
      await sb.storage.from("job-receipts").remove([r.storage_path]);
      const { error } = await sb.from("receipts").delete().eq("id", r.id);
      if (error) throw error;
      void load();
    } catch {
      showToast({ message: "Delete failed.", variant: "error" });
    }
  };

  const allJobsForSelect = jobs;

  function renderReceiptCard(r: ReceiptRow) {
    const emp = profiles[r.uploaded_by];
    const jobMeta = r.job_id ? jobs.find((j) => j.id === r.job_id) : null;
    const jobLabel = jobMeta?.label ?? "Job";
    const jst = r.job_id ? jobStatsById.get(r.job_id) : undefined;
    return (
      <div
        key={r.id}
        className="flex flex-wrap gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
      >
        <button
          type="button"
          className="shrink-0"
          onClick={() =>
            thumbs[r.id] ? setLightbox(thumbs[r.id]!) : undefined
          }
        >
          {thumbs[r.id] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbs[r.id]}
              alt=""
              className="h-24 w-24 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-white/5 text-xs text-white/40">
              —
            </div>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-white">{r.vendor_name ?? "—"}</p>
          <p className="text-xs text-white/50">
            {r.receipt_date ?? "—"} · {displayProfileName(emp ?? {})}
          </p>
          <p className="mt-1 text-xl font-bold text-[#E8C84A]">
            {formatReceiptCurrency(r.total_amount)}
          </p>
          <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">
            {r.receipt_category}
          </span>
          <p className="mt-2 text-sm">
            {r.job_id ? (
              <Link
                href={`/jobs/${r.job_id}`}
                className="text-[#E8C84A] hover:underline"
              >
                {jobLabel}
              </Link>
            ) : (
              <span className="font-medium text-red-400">Unassigned</span>
            )}
          </p>
          {r.job_id && jobMeta?.addressLine ? (
            <p className="mt-1 text-xs text-white/45">{jobMeta.addressLine}</p>
          ) : null}
          {r.job_id && jst ? (
            <p className="mt-1 text-xs text-white/50">
              {jst.count} receipt{jst.count === 1 ? "" : "s"} on this job ·{" "}
              {formatReceiptCurrency(jst.total)} job total
            </p>
          ) : null}
          {!r.job_id ? (
            <button
              type="button"
              className="mt-2 text-sm font-medium text-[#E8C84A] hover:underline"
              onClick={() => {
                setAssignId(r.id);
                setAssignJob("");
              }}
            >
              Assign to job
            </button>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  className="text-xs text-white/70 hover:underline"
                  onClick={() => setEditing({ ...r })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-xs text-red-300 hover:underline"
                  onClick={() => void deleteReceipt(r)}
                >
                  Delete
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <WideAppHeader active="dashboard" showTppSubtitle />
      <main className="app-page-shell mx-auto w-full min-w-0 max-w-4xl flex-1 py-8 md:py-10">
        <Link
          href="/dashboard"
          className="text-sm text-[#E8C84A] hover:underline"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-white">Receipts</h1>
        <p className="mt-1 text-sm text-white/55">
          Capture, review, and assign expense receipts to jobs.
        </p>

        <div className="mt-6" data-receipt-capture-anchor>
          <ReceiptCapture title="📷 Capture receipt" onSaved={() => void load()} />
        </div>

        <div
          className="mt-8 flex min-w-0 flex-wrap gap-1 overflow-x-auto border-b border-white/10 pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
        >
          {(
            [
              ["all", "All"],
              ["unassigned", "Unassigned"],
              ["by_job", "By job"],
              ["mine", "My receipts"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold ${
                tab === k
                  ? "bg-white/[0.08] text-[#E8C84A]"
                  : "text-white/55 hover:bg-white/[0.04]"
              }`}
              onClick={() => setTab(k)}
            >
              {label}
              {k === "unassigned" && unassignedCount > 0 ? (
                <span className="ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-red-500/90 px-1.5 text-[11px] font-bold text-white">
                  {unassignedCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="mt-6 min-w-0 space-y-4">
          {loading ? (
            <ReceiptListSkeleton count={6} />
          ) : tab === "by_job" ? (
            jobReceiptGroups.length === 0 ? (
              <EmptyState
                icon={<span aria-hidden>🏗️</span>}
                title="No job-linked receipts"
                description="Assign receipts to a job to see them grouped here with totals and categories."
              />
            ) : (
              <div className="space-y-10">
                {jobReceiptGroups.map(
                  ({ jobId, rows, jm, total, byCat }) => (
                    <section
                      key={jobId}
                      className="rounded-2xl border border-emerald-500/30 bg-emerald-950/15 p-4 ring-1 ring-emerald-500/15"
                    >
                      <div className="border-b border-white/10 pb-3">
                        <Link
                          href={`/jobs/${jobId}`}
                          className="text-lg font-semibold text-[#E8C84A] hover:underline"
                        >
                          {jm?.label ?? "Job"}
                        </Link>
                        {jm?.addressLine ? (
                          <p className="mt-1 text-sm text-white/55">
                            {jm.addressLine}
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm text-white/75">
                          <span className="font-semibold text-white">
                            {rows.length}
                          </span>{" "}
                          receipt{rows.length === 1 ? "" : "s"} · Running
                          expenses{" "}
                          <span className="font-bold text-[#E8C84A]">
                            {formatReceiptCurrency(total)}
                          </span>
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {Object.entries(byCat)
                            .sort((a, b) => b[1] - a[1])
                            .map(([cat, amt]) => (
                              <span
                                key={cat}
                                className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/85"
                              >
                                {cat}: {formatReceiptCurrency(amt)}
                              </span>
                            ))}
                        </div>
                      </div>
                      <div className="mt-4 space-y-4">
                        {rows.map((r) => renderReceiptCard(r))}
                      </div>
                    </section>
                  ),
                )}
              </div>
            )
          ) : filtered.length === 0 ? (
            tab === "all" && receipts.length === 0 ? (
              <EmptyState
                icon={<span aria-hidden>🧾</span>}
                title="No receipts yet"
                description="Capture a receipt above to save it here. Assigned receipts appear on jobs."
                actionLabel="Scroll to capture"
                onAction={() => {
                  document
                    .querySelector<HTMLElement>("[data-receipt-capture-anchor]")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            ) : tab === "unassigned" ? (
              <EmptyState
                icon={<span aria-hidden>✅</span>}
                title="No unassigned receipts"
                description="Every captured receipt is linked to a job, or you have not uploaded any yet."
              />
            ) : (
              <EmptyState
                icon={<span aria-hidden>📷</span>}
                title="No receipts from you"
                description="Receipts you upload with your account show up in this tab."
              />
            )
          ) : (
            filtered.map((r) => renderReceiptCard(r))
          )}
        </div>
      </main>

      {lightbox ? (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          aria-label="Close"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </button>
      ) : null}

      {assignId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#0a1628] p-5">
            <h3 className="text-lg font-semibold text-white">Assign to job</h3>
            <select
              className="app-input mt-3 w-full text-sm"
              value={assignJob}
              onChange={(e) => setAssignJob(e.target.value)}
            >
              <option value="">— Choose job —</option>
              {allJobsForSelect.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-primary btn-h-11"
                onClick={() => void assignToJob()}
              >
                Save
              </button>
              <button
                type="button"
                className="btn-secondary btn-h-11"
                onClick={() => {
                  setAssignId(null);
                  setAssignJob("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/15 bg-[#0a1628] p-5">
            <h3 className="text-lg font-semibold text-white">Edit receipt</h3>
            <div className="mt-4 space-y-3">
              <label className="block text-xs text-white/50">
                Vendor
                <input
                  className="app-input mt-1 w-full text-sm"
                  value={editing.vendor_name ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, vendor_name: e.target.value })
                  }
                />
              </label>
              <label className="block text-xs text-white/50">
                Date
                <input
                  type="date"
                  className="app-input mt-1 w-full text-sm"
                  value={editing.receipt_date ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, receipt_date: e.target.value })
                  }
                />
              </label>
              <label className="block text-xs text-white/50">
                Total
                <input
                  type="number"
                  step="0.01"
                  className="app-input mt-1 w-full text-sm"
                  value={editing.total_amount}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      total_amount: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label className="block text-xs text-white/50">
                Category
                <select
                  className="app-input mt-1 w-full text-sm"
                  value={editing.receipt_category}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      receipt_category: e.target.value as ReceiptCategory,
                    })
                  }
                >
                  {RECEIPT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-white/50">
                Job
                <select
                  className="app-input mt-1 w-full text-sm"
                  value={editing.job_id ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      job_id: e.target.value.trim() || null,
                    })
                  }
                >
                  <option value="">— Unassigned —</option>
                  {allJobsForSelect.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-white/50">
                Notes
                <textarea
                  className="app-input mt-1 min-h-[4rem] w-full text-sm"
                  value={editing.notes ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, notes: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-primary btn-h-11"
                onClick={() => void saveEdit()}
              >
                Save
              </button>
              <button
                type="button"
                className="btn-secondary btn-h-11"
                onClick={() => setEditing(null)}
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
