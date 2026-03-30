"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReceiptCapture } from "@/components/receipt-capture";
import { useAppToast } from "@/components/toast-provider";
import { useUserRole } from "@/hooks/use-user-role";
import {
  exportJobReceiptsCsv,
  exportJobReceiptsPdf,
} from "@/lib/job-receipts-export";
import {
  formatReceiptCurrency,
  receiptCategoryBucket,
  type ReceiptRow,
} from "@/lib/receipts-types";
import { parseReceiptRow } from "@/lib/receipts-parse";
import { canManageReceiptsAdmin } from "@/lib/user-roles";
import { createBrowserClient } from "@/lib/supabase/client";
import { useReceiptThumbIntersection } from "@/hooks/use-receipt-thumb-intersection";

export function JobReceiptsTab({
  jobId,
  jobLabel,
}: {
  jobId: string;
  jobLabel: string;
}) {
  const { showToast } = useAppToast();
  const { role } = useUserRole();
  const isAdmin = canManageReceiptsAdmin(role);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const { bindReceiptThumb } = useReceiptThumbIntersection(
    thumbUrls,
    setThumbUrls,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = createBrowserClient();
      const { data, error } = await sb
        .from("receipts")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []).map((x) =>
        parseReceiptRow(x as Record<string, unknown>),
      );
      setReceipts(rows);

      setThumbUrls({});
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : "Could not load receipts.",
        variant: "error",
      });
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [jobId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    let materials = 0;
    let gasFuel = 0;
    let tools = 0;
    let other = 0;
    for (const r of receipts) {
      const t = Number(r.total_amount) || 0;
      const b = receiptCategoryBucket(r.receipt_category);
      if (b === "Materials") materials += t;
      else if (b === "Gas/Fuel") gasFuel += t;
      else if (b === "Tools") tools += t;
      else other += t;
    }
    return {
      materials,
      gasFuel,
      tools,
      other,
      grand: materials + gasFuel + tools + other,
    };
  }, [receipts]);

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ReceiptCapture
          jobId={jobId}
          title="Add receipt"
          onSaved={() => void load()}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={receipts.length === 0}
            onClick={() =>
              exportJobReceiptsCsv(receipts, jobLabel)
            }
            className="btn-secondary btn-h-11 border-[#E8C84A]/40 text-[#E8C84A] disabled:opacity-40"
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled={receipts.length === 0}
            onClick={() =>
              exportJobReceiptsPdf(receipts, jobLabel, totals)
            }
            className="btn-secondary btn-h-11 border-[#E8C84A]/40 text-[#E8C84A] disabled:opacity-40"
          >
            Export PDF
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-white/55">
          Running totals by category
        </h3>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-white/60">Materials</dt>
            <dd className="font-semibold tabular-nums text-[#E8C84A]">
              {formatReceiptCurrency(totals.materials)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/60">Gas/Fuel</dt>
            <dd className="font-semibold tabular-nums text-[#E8C84A]">
              {formatReceiptCurrency(totals.gasFuel)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/60">Tools</dt>
            <dd className="font-semibold tabular-nums text-[#E8C84A]">
              {formatReceiptCurrency(totals.tools)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/60">Other</dt>
            <dd className="font-semibold tabular-nums text-[#E8C84A]">
              {formatReceiptCurrency(totals.other)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-white/10 pt-2 sm:col-span-2">
            <dt className="font-semibold text-white">TOTAL</dt>
            <dd className="text-lg font-bold tabular-nums text-[#E8C84A]">
              {formatReceiptCurrency(totals.grand)}
            </dd>
          </div>
        </dl>
      </section>

      {loading ? (
        <p className="text-sm text-white/50">Loading receipts…</p>
      ) : receipts.length === 0 ? (
        <p className="text-sm text-white/50">No receipts for this job yet.</p>
      ) : (
        <ul className="space-y-3">
          {receipts.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap gap-3 rounded-xl border border-white/10 bg-black/20 p-3"
            >
              <div ref={bindReceiptThumb(r)} className="shrink-0">
                {thumbUrls[r.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbUrls[r.id]}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div
                    className="h-20 w-20 shrink-0 rounded-lg bg-white/10 ring-1 ring-white/10 animate-pulse"
                    aria-hidden
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white">
                  {r.vendor_name ?? "—"}
                </p>
                <p className="text-xs text-white/50">
                  {r.receipt_date ?? "—"} · {r.receipt_category}
                </p>
                <p className="mt-1 text-lg font-bold text-[#E8C84A]">
                  {formatReceiptCurrency(r.total_amount)}
                </p>
                {isAdmin ? (
                  <button
                    type="button"
                    className="mt-2 text-xs text-red-300 hover:underline"
                    onClick={async () => {
                      if (!window.confirm("Delete this receipt?")) return;
                      try {
                        const sb = createBrowserClient();
                        await sb.storage
                          .from("job-receipts")
                          .remove([r.storage_path]);
                        const { error } = await sb
                          .from("receipts")
                          .delete()
                          .eq("id", r.id);
                        if (error) throw error;
                        void load();
                      } catch {
                        showToast({
                          message: "Could not delete.",
                          variant: "error",
                        });
                      }
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
