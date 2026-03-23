"use client";

import { useState } from "react";
import { formatDurationSeconds, formatUsd } from "@/lib/scan-modes";

export type ScanProgressPageRow = {
  page: number;
  state: "done_ok" | "done_empty" | "done_error" | "running" | "waiting";
  itemCount?: number;
};

function rowIcon(row: ScanProgressPageRow): string {
  switch (row.state) {
    case "done_ok":
      return "✅";
    case "done_empty":
      return "✅";
    case "done_error":
      return "❌";
    case "running":
      return "⏳";
    default:
      return "○";
  }
}

function rowLabel(row: ScanProgressPageRow): string {
  if (row.state === "running") return `Page ${row.page} — analyzing…`;
  if (row.state === "waiting") return `Page ${row.page} — waiting`;
  if (row.state === "done_error") return `Page ${row.page} — error`;
  if (row.state === "done_empty")
    return `Page ${row.page} — 0 items (no electrical)`;
  if (row.itemCount == null)
    return `Page ${row.page} — completed earlier`;
  return `Page ${row.page} — ${row.itemCount} items found`;
}

export function ScanProgressOverlay({
  open,
  variant,
  title,
  progressPct,
  pageLine,
  phasePrimary,
  phaseSecondary,
  pageRows,
  elapsedSec,
  estRemainingSec,
  costSoFar,
  sessionCostEstimate,
  scanCompleteMessage,
  onDismissComplete,
  cancelPagesCompleted,
  onCancelScan,
}: {
  open: boolean;
  variant: "single" | "batch";
  title: string;
  progressPct: number;
  pageLine: string;
  phasePrimary: string;
  phaseSecondary?: string | null;
  pageRows: ScanProgressPageRow[];
  elapsedSec: number;
  estRemainingSec: number | null;
  costSoFar: number;
  sessionCostEstimate: number | null;
  scanCompleteMessage?: string | null;
  onDismissComplete?: () => void;
  /** Batch: pages finished before cancel (for confirmation copy). */
  cancelPagesCompleted?: number;
  onCancelScan: () => void;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const pagesDoneFromRows = pageRows.filter((r) =>
    ["done_ok", "done_empty", "done_error"].includes(r.state),
  ).length;
  const pagesDone =
    cancelPagesCompleted != null ? cancelPagesCompleted : pagesDoneFromRows;

  if (!open) return null;

  const pct = Math.max(0, Math.min(100, Math.round(progressPct)));

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-[#030a14]/90 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-busy={!scanCompleteMessage}
      aria-labelledby="scan-progress-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-2xl">
        <h2
          id="scan-progress-title"
          className="text-lg font-semibold text-white"
        >
          {title}
        </h2>

        <div className="mt-4">
          <div
            className="h-3 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500 transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs tabular-nums text-white/60">
            {pct}%
          </p>
        </div>

        <p className="mt-2 text-sm font-medium text-white/90">{pageLine}</p>
        <p className="mt-1 text-sm text-sky-200/90">{phasePrimary}</p>
        {phaseSecondary ? (
          <p className="mt-0.5 text-sm text-violet-200/85">{phaseSecondary}</p>
        ) : null}

        {variant === "batch" && pageRows.length > 0 ? (
          <ul className="mt-4 max-h-52 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20 py-2 pl-3 pr-2 text-xs text-white/85">
            {pageRows.map((r) => (
              <li
                key={r.page}
                className={
                  r.state === "done_error" ? "text-red-200/90" : undefined
                }
              >
                <span className="mr-1.5 inline-block w-4 text-center">
                  {rowIcon(r)}
                </span>
                {rowLabel(r)}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 space-y-1 border-t border-white/10 pt-4 text-sm text-white/70">
          <p>
            Time elapsed:{" "}
            <span className="tabular-nums text-white">
              {formatDurationSeconds(elapsedSec)}
            </span>
          </p>
          {variant === "batch" && estRemainingSec != null ? (
            <p>
              Est. remaining:{" "}
              <span className="tabular-nums text-white">
                {formatDurationSeconds(estRemainingSec)}
              </span>
            </p>
          ) : null}
          <p>
            Cost so far:{" "}
            <span className="tabular-nums text-emerald-200/95">
              {formatUsd(costSoFar)}
            </span>
          </p>
          {sessionCostEstimate != null ? (
            <p className="text-xs text-white/50">
              {variant === "single"
                ? `Est. cost this page: ${formatUsd(sessionCostEstimate)}`
                : `Session estimate (if completed): ${formatUsd(sessionCostEstimate)}`}
            </p>
          ) : null}
        </div>

        {scanCompleteMessage ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg border border-emerald-500/35 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100/95">
              {scanCompleteMessage}
            </p>
            {onDismissComplete ? (
              <button
                type="button"
                onClick={onDismissComplete}
                className="w-full rounded-lg border border-emerald-500/50 bg-emerald-700/80 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Done
              </button>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="mt-5 w-full rounded-lg border border-amber-500/45 bg-amber-950/40 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-950/55"
          >
            {variant === "single" ? "Cancel" : "Cancel Scan"}
          </button>
        )}

        {confirmCancel ? (
          <div
            className="fixed inset-0 z-[270] flex items-center justify-center bg-black/80 p-4"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setConfirmCancel(false);
            }}
          >
            <div
              className="max-w-sm rounded-xl border border-white/15 bg-[#0f1f35] p-5 shadow-xl"
              role="alertdialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm leading-relaxed text-white/90">
                {variant === "batch" ? (
                  pagesDone > 0 ? (
                    <>
                      Cancel scan?{" "}
                      <strong className="text-white">{pagesDone}</strong> page
                      {pagesDone === 1 ? "" : "s"} already analyzed and saved. You
                      can resume later.
                    </>
                  ) : (
                    <>
                      Cancel this batch? No pages have been saved in this run
                      yet.
                    </>
                  )
                ) : (
                  <>
                    Cancel this scan? In-progress work on the current page will
                    stop.
                  </>
                )}
              </p>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15"
                >
                  Continue Scanning
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmCancel(false);
                    onCancelScan();
                  }}
                  className="rounded-lg border border-red-500/50 bg-red-950/50 px-3 py-1.5 text-sm font-semibold text-red-100 hover:bg-red-950/70"
                >
                  Cancel Scan
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
