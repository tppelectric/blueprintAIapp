"use client";

import { useMemo, useState } from "react";
import {
  SCAN_MODES,
  formatUsd,
  scanModeById,
  totalCostPerPage,
  type ScanModeId,
} from "@/lib/scan-modes";

export function ScanModeDialog({
  open,
  pageCount,
  onClose,
  onStart,
  showApiCosts = true,
  extraHint,
}: {
  open: boolean;
  pageCount: number;
  onClose: () => void;
  onStart: (mode: ScanModeId) => void;
  showApiCosts?: boolean;
  /** Optional savings / trade note under estimates */
  extraHint?: string | null;
}) {
  const [selected, setSelected] = useState<ScanModeId>("standard");

  const meta = useMemo(() => scanModeById(selected), [selected]);
  const estSecondsTotal = meta.estSecondsPerPage * pageCount;
  const estMinutes = Math.max(1, Math.ceil(estSecondsTotal / 60));
  const estCostTotal = totalCostPerPage(meta) * pageCount;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0a1628] p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-mode-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="scan-mode-title"
          className="text-lg font-semibold text-white"
        >
          Choose Scan Mode
        </h2>

        <div className="mt-4 space-y-3">
          {SCAN_MODES.map((m) => (
            <label
              key={m.id}
              className={[
                "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
                selected === m.id
                  ? "border-sky-400/70 bg-sky-950/35"
                  : "border-white/12 bg-white/[0.03] hover:border-white/20",
              ].join(" ")}
            >
              <input
                type="radio"
                name="scan-mode"
                checked={selected === m.id}
                onChange={() => setSelected(m.id)}
                className="mt-1 accent-sky-500"
              />
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-white">
                  {m.label}
                  {m.recommended ? (
                    <span className="ml-2 text-xs font-normal text-emerald-300/90">
                      (Recommended)
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-sm text-white/65">
                  {m.subtitle}
                </span>
                {showApiCosts ? (
                  <span className="mt-1 block text-xs text-white/45">
                    Est. cost: {formatUsd(totalCostPerPage(m))}/page
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/80">
          <p>
            For <strong className="text-white">{pageCount}</strong> page
            {pageCount === 1 ? "" : "s"}:
          </p>
          <p className="mt-1">
            Estimated time:{" "}
            <strong className="text-white">
              {meta.id === "manual"
                ? "—"
                : estMinutes === 1
                  ? "~1 minute"
                  : `~${estMinutes} minutes`}
            </strong>
          </p>
          {showApiCosts ? (
            <p className="mt-0.5">
              Estimated cost:{" "}
              <strong className="text-white">
                {meta.id === "manual" ? "$0.00" : formatUsd(estCostTotal)}
              </strong>
            </p>
          ) : null}
        </div>

        {extraHint ? (
          <p className="mt-3 rounded-lg border border-[#E8C84A]/30 bg-[#E8C84A]/10 px-3 py-2 text-xs leading-snug text-[#E8C84A]/95">
            {extraHint}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onStart(selected)}
            className="rounded-lg border border-sky-500/50 bg-sky-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
          >
            Start Scan
          </button>
        </div>
      </div>
    </div>
  );
}
