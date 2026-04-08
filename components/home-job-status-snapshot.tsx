"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useUserRole } from "@/hooks/use-user-role";
import {
  PIPELINE_BUCKET_OPTIONS,
  bucketForValue,
  normalizeInvoiceStatus,
  type PipelineCountBucket,
} from "@/lib/pipeline-bucket-config";

type StatusCount = { status: string; count: number };

type OverrideRow = {
  need_ready_to_invoice_value: string;
  bucket: string;
};

function overrideMapFromRows(rows: OverrideRow[]): Map<string, PipelineCountBucket> {
  const m = new Map<string, PipelineCountBucket>();
  for (const r of rows) {
    const v = r.need_ready_to_invoice_value?.trim();
    if (!v) continue;
    const b = r.bucket as PipelineCountBucket;
    if (!PIPELINE_BUCKET_OPTIONS.some((o) => o.id === b)) continue;
    m.set(normalizeInvoiceStatus(v), b);
  }
  return m;
}

const STATUS_CONFIG: {
  status: string;
  label: string;
  color: string;
  border: string;
  jobsNeedReadyParam: string[] | null;
}[] = [
  {
    status: "ready_to_invoice",
    label: "Ready to Invoice",
    color: "text-[#E8C84A]",
    border: "border-[#E8C84A]/30",
    jobsNeedReadyParam: ["YES, READY TO BE INVOICED"],
  },
  {
    status: "in_progress",
    label: "In Progress",
    color: "text-blue-300",
    border: "border-blue-500/30",
    jobsNeedReadyParam: [
      "NEW JOB/JUST STARTED",
      "NO, JOB STILL IN PROGRESS",
      "IN PROGRESS",
      "ESTIMATING",
    ],
  },
  {
    status: "invoiced",
    label: "Invoiced",
    color: "text-sky-200",
    border: "border-sky-500/30",
    jobsNeedReadyParam: [
      "INVOICED/SENT",
      "PARTIAL/PROGRESS PAYMENT RECEIVED",
      "DOCUMENT MADE/NEEDS REVIEW BEFORE SENDING",
    ],
  },
  {
    status: "paid",
    label: "Paid",
    color: "text-emerald-300",
    border: "border-emerald-500/30",
    jobsNeedReadyParam: ["PAID", "BARTERED WORK"],
  },
  {
    status: "on_hold",
    label: "On Hold",
    color: "text-amber-200",
    border: "border-amber-500/30",
    jobsNeedReadyParam: [
      "ON HOLD/WAITING FOR MATERIAL",
      "ON HOLD/WAITING FOR APPROVAL",
    ],
  },
  {
    status: "needs_update",
    label: "Needs Update",
    color: "text-rose-300",
    border: "border-rose-500/20",
    jobsNeedReadyParam: null,
  },
];

export function HomeJobStatusSnapshot() {
  const { role, loading: roleLoading } = useUserRole();
  const isAllowed =
    role === "super_admin" || role === "admin";

  const [counts, setCounts] = useState<StatusCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  const [syncOpen, setSyncOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [unrecognized, setUnrecognized] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<
    Record<string, PipelineCountBucket>
  >({});
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    if (roleLoading || !isAllowed) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/jobs/status-counts", {
          credentials: "include",
        });
        if (cancelled) return;
        if (!res.ok) {
          setCounts([]);
          return;
        }
        const body = (await res.json()) as {
          ok?: boolean;
          counts?: Record<string, number>;
        };
        if (cancelled) return;
        if (!body.ok || !body.counts) {
          setCounts([]);
          return;
        }
        const { counts: byStatus } = body;
        setCounts(
          STATUS_CONFIG.map((c) => ({
            status: c.status,
            count:
              c.status === "completed"
                ? (byStatus["completed"] ?? 0) + (byStatus["complete"] ?? 0)
                : (byStatus[c.status] ?? 0),
          })),
        );
      } catch {
        if (!cancelled) setCounts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roleLoading, isAllowed, refreshTick]);

  const openSync = useCallback(async () => {
    setSyncOpen(true);
    setSyncError(null);
    setSyncLoading(true);
    setUnrecognized([]);
    setAssignments({});
    try {
      const [valsRes, ovrRes] = await Promise.all([
        fetch("/api/jobs/invoice-status-values", { credentials: "include" }),
        fetch("/api/jobs/pipeline-bucket-overrides", {
          credentials: "include",
        }),
      ]);
      if (!valsRes.ok) {
        const t = await valsRes.text();
        throw new Error(t || "Could not load invoice values.");
      }
      if (!ovrRes.ok) {
        const t = await ovrRes.text();
        throw new Error(t || "Could not load overrides.");
      }
      const valsBody = (await valsRes.json()) as { values?: string[] };
      const ovrBody = (await ovrRes.json()) as { overrides?: OverrideRow[] };
      const values = valsBody.values ?? [];
      const overrides = ovrBody.overrides ?? [];
      const map = overrideMapFromRows(overrides);
      const unrec = values.filter(
        (v) => bucketForValue(v, map) === "needs_update",
      );
      const init: Record<string, PipelineCountBucket> = {};
      for (const v of unrec) {
        init[v] = "needs_update";
      }
      setUnrecognized(unrec);
      setAssignments(init);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncLoading(false);
    }
  }, []);

  const saveAssignments = useCallback(async () => {
    if (unrecognized.length === 0) {
      setSyncOpen(false);
      return;
    }
    setSaveLoading(true);
    setSyncError(null);
    try {
      const payload = {
        assignments: unrecognized.map((v) => ({
          need_ready_to_invoice_value: v,
          bucket: assignments[v] ?? "needs_update",
        })),
      };
      const res = await fetch("/api/jobs/pipeline-bucket-overrides", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Save failed.");
      }
      setSyncOpen(false);
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaveLoading(false);
    }
  }, [assignments, unrecognized]);

  if (roleLoading || !isAllowed) return null;

  return (
    <section
      className="mt-4 w-full max-w-6xl self-stretch text-left"
      aria-label="Job status snapshot"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
            Job Pipeline
          </p>
          {role === "super_admin" ? (
            <button
              type="button"
              onClick={() => void openSync()}
              className="rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-[#E8C84A] hover:bg-white/[0.1]"
            >
              Sync
            </button>
          ) : null}
        </div>
        <Link
          href="/jobs"
          className="text-xs text-[#E8C84A] hover:underline"
        >
          View all jobs →
        </Link>
      </div>
      {loading ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {STATUS_CONFIG.map((c) => (
            <div
              key={c.status}
              className="h-16 animate-pulse rounded-xl border border-white/10 bg-white/[0.04]"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {STATUS_CONFIG.map((cfg) => {
            const count =
              counts.find((c) => c.status === cfg.status)?.count ?? 0;
            return (
              <Link
                key={cfg.status}
                href={
                  cfg.jobsNeedReadyParam
                    ? `/jobs?status=${encodeURIComponent(cfg.jobsNeedReadyParam.join("|"))}`
                    : "/jobs"
                }
                className={`flex flex-col rounded-xl border bg-white/[0.04] p-3 text-left transition-colors hover:bg-white/[0.07] ${cfg.border}`}
              >
                <span
                  className={`text-xl font-bold tabular-nums ${cfg.color}`}
                >
                  {count}
                </span>
                <span className="mt-0.5 text-[11px] text-white/50">
                  {cfg.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {syncOpen ? (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pipeline-sync-title"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-white/12 bg-[#0a1628] shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2
                id="pipeline-sync-title"
                className="text-sm font-semibold text-white"
              >
                Pipeline bucket sync
              </h2>
              <button
                type="button"
                onClick={() => setSyncOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-white/60 hover:bg-white/[0.08] hover:text-white"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="max-h-[calc(85vh-8rem)] overflow-y-auto px-4 py-3">
              {syncLoading ? (
                <p className="text-sm text-white/55">Loading…</p>
              ) : syncError ? (
                <p className="text-sm text-red-300">{syncError}</p>
              ) : unrecognized.length === 0 ? (
                <p className="text-sm text-white/55">
                  No unrecognized invoice status values. All distinct values map
                  to a pipeline bucket via defaults or overrides.
                </p>
              ) : (
                <>
                  <p className="mb-3 text-xs text-white/50">
                    Assign each value to a pipeline bucket. Drag is not required—use
                    the dropdown per row.
                  </p>
                  <ul className="space-y-3">
                    {unrecognized.map((v) => (
                      <li
                        key={v}
                        className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="text-xs text-white/90 sm:max-w-[55%]">
                          {v}
                        </span>
                        <select
                          className="rounded-lg border border-white/15 bg-[#0a1628] px-2 py-1.5 text-xs text-white sm:min-w-[11rem]"
                          value={assignments[v] ?? "needs_update"}
                          onChange={(e) =>
                            setAssignments((prev) => ({
                              ...prev,
                              [v]: e.target.value as PipelineCountBucket,
                            }))
                          }
                        >
                          {PIPELINE_BUCKET_OPTIONS.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
              <button
                type="button"
                onClick={() => setSyncOpen(false)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  saveLoading || syncLoading || unrecognized.length === 0
                }
                onClick={() => void saveAssignments()}
                className="rounded-lg border border-[#E8C84A]/45 bg-[#E8C84A]/15 px-3 py-1.5 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saveLoading ? "Saving…" : "Save mappings"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
