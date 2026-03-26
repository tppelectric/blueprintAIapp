"use client";

import { useState } from "react";

export function RoomScanBatchOverlay({
  open,
  currentPageIndex,
  totalPages,
  onCancel,
}: {
  open: boolean;
  /** 1-based index of the page currently being scanned. */
  currentPageIndex: number;
  totalPages: number;
  onCancel: () => void;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!open || totalPages < 1) return null;

  const pct =
    totalPages > 0
      ? Math.min(
          99,
          Math.round(
            ((Math.max(1, currentPageIndex) - 1) / totalPages) * 100,
          ),
        )
      : 0;

  return (
    <div
      className="fixed inset-0 z-[255] flex items-center justify-center bg-[#030a14]/90 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="room-scan-batch-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-2xl">
        <h2
          id="room-scan-batch-title"
          className="text-lg font-semibold text-white"
        >
          Room scan
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
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs tabular-nums text-white/60">
            {pct}%
          </p>
        </div>

        <p className="mt-3 text-sm font-medium text-teal-100/95">
          Scanning page {Math.min(currentPageIndex, totalPages)} of{" "}
          {totalPages}…
        </p>

        <button
          type="button"
          onClick={() => setConfirmCancel(true)}
          className="mt-6 w-full rounded-lg border border-amber-500/45 bg-amber-950/40 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-950/55"
        >
          Cancel
        </button>
      </div>

      {confirmCancel ? (
        <div
          className="fixed inset-0 z-[260] flex items-center justify-center bg-black/80 p-4"
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
              Stop the room scan? Pages already finished in this run are
              discarded until you run again.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15"
              >
                Keep scanning
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmCancel(false);
                  onCancel();
                }}
                className="rounded-lg border border-red-500/50 bg-red-950/50 px-3 py-1.5 text-sm font-semibold text-red-100 hover:bg-red-950/70"
              >
                Stop scan
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
