"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  formatUsd,
  scanModeById,
  totalCostPerPage,
  type ScanModeId,
} from "@/lib/scan-modes";
import { tradeMeta } from "@/lib/sheet-trade-designation";
import type { PageThumbScanStatus } from "@/lib/blueprint-viewer-thumb-types";

export type PagePickMeta = {
  scanStatus?: PageThumbScanStatus;
  itemCount: number;
  lastScan: string | null;
  tradeSlug: string | null;
};

function statusIcon(s: PageThumbScanStatus | undefined): string {
  switch (s) {
    case "ok":
      return "✅";
    case "warn":
      return "⚠️";
    case "error":
      return "❌";
    case "spin":
      return "🔄";
    default:
      return "○";
  }
}

export function SelectPagesScanModal({
  open,
  numPages,
  selected,
  onChangeSelected,
  pageMeta,
  thumbnailCells,
  onClose,
  onStartScan,
  estimateMode = "standard",
}: {
  open: boolean;
  numPages: number;
  selected: Set<number>;
  onChangeSelected: (next: Set<number>) => void;
  pageMeta: Record<number, PagePickMeta>;
  /** One cell per page (1..numPages), same order; includes thumbnail + checkbox inside cell */
  thumbnailCells: ReactNode[];
  onClose: () => void;
  onStartScan: () => void;
  estimateMode?: ScanModeId;
}) {
  const [localMode, setLocalMode] = useState<ScanModeId>(estimateMode);
  const meta = useMemo(() => scanModeById(localMode), [localMode]);
  const nSel = selected.size;
  const estMinutes = useMemo(() => {
    if (nSel === 0 || meta.id === "manual") return 0;
    const sec = meta.estSecondsPerPage * nSel;
    return Math.max(1, Math.ceil(sec / 60));
  }, [nSel, meta]);
  const estCost = totalCostPerPage(meta) * nSel;

  if (!open) return null;

  const allPages = Array.from({ length: numPages }, (_, i) => i + 1);

  const selectAll = () => onChangeSelected(new Set(allPages));
  const deselectAll = () => onChangeSelected(new Set());
  const electricalOnly = () => {
    const next = new Set<number>();
    for (const p of allPages) {
      if (pageMeta[p]?.tradeSlug === "electrical") next.add(p);
    }
    onChangeSelected(next);
  };
  const unscannedOnly = () => {
    const next = new Set<number>();
    for (const p of allPages) {
      const st = pageMeta[p]?.scanStatus;
      if (st !== "ok" && st !== "warn") next.add(p);
    }
    onChangeSelected(next);
  };

  const toggle = (p: number) => {
    const next = new Set(selected);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChangeSelected(next);
  };

  return (
    <div
      className="fixed inset-0 z-[265] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0a1628] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="select-pages-scan-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-white/10 px-4 py-3 sm:px-5">
          <h2
            id="select-pages-scan-title"
            className="text-lg font-semibold text-white"
          >
            Select Pages to Analyze
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/15"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/15"
            >
              Deselect All
            </button>
            <button
              type="button"
              onClick={electricalOnly}
              className="rounded-lg border border-[#E8C84A]/40 bg-[#E8C84A]/10 px-2.5 py-1 text-xs font-semibold text-[#E8C84A] hover:bg-[#E8C84A]/18"
            >
              Electrical Only
            </button>
            <button
              type="button"
              onClick={unscannedOnly}
              className="rounded-lg border border-sky-500/40 bg-sky-950/35 px-2.5 py-1 text-xs font-semibold text-sky-100 hover:bg-sky-950/50"
            >
              Unscanned Only
            </button>
          </div>
          <p className="mt-2 text-[11px] text-white/50">
            Estimate uses mode below (you will confirm again in the next step).
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-white/75">
            <span className="shrink-0">Est. mode:</span>
            <select
              value={localMode}
              onChange={(e) => setLocalMode(e.target.value as ScanModeId)}
              className="rounded border border-white/20 bg-[#071422] px-2 py-1 text-white"
            >
              <option value="quick">Quick</option>
              <option value="standard">Standard</option>
              <option value="deep">Deep</option>
            </select>
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {allPages.map((p, idx) => {
              const m = pageMeta[p];
              const tm = tradeMeta(m?.tradeSlug ?? null);
              return (
                <div
                  key={p}
                  className={`rounded-xl border p-2 transition-colors ${
                    selected.has(p)
                      ? "border-violet-400/70 bg-violet-950/25 ring-1 ring-violet-400/40"
                      : "border-white/12 bg-white/[0.03]"
                  }`}
                >
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p)}
                      onChange={() => toggle(p)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-white/30 bg-[#0a1628]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white">
                          Page {p}
                        </span>
                        <span
                          className="text-sm"
                          title="Scan status"
                          aria-hidden
                        >
                          {statusIcon(m?.scanStatus)}
                        </span>
                      </div>
                      {tm ? (
                        <span className="mt-0.5 inline-block rounded bg-white/10 px-1 py-0.5 text-[9px] text-white/85">
                          {tm.emoji} {tm.short}
                        </span>
                      ) : null}
                      <p className="mt-1 text-[10px] text-white/55">
                        {m?.itemCount
                          ? `${m.itemCount} item${m.itemCount === 1 ? "" : "s"}`
                          : "No items"}
                      </p>
                      {m?.lastScan ? (
                        <p className="text-[9px] text-white/40">
                          {new Date(m.lastScan).toLocaleDateString()}
                        </p>
                      ) : (
                        <p className="text-[9px] text-white/35">Not scanned</p>
                      )}
                      <div className="mt-2">{thumbnailCells[idx]}</div>
                    </div>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 space-y-2 border-t border-white/10 bg-[#071422]/80 px-4 py-3 sm:px-5">
          <p className="text-sm text-white/85">
            <strong className="text-white">{nSel}</strong> page
            {nSel === 1 ? "" : "s"} selected
          </p>
          <p className="text-sm text-white/75">
            Est. time:{" "}
            <strong className="text-[#E8C84A]">
              {meta.id === "manual" || nSel === 0
                ? "—"
                : estMinutes === 1
                  ? "~1 minute"
                  : `~${estMinutes} minutes`}
            </strong>
          </p>
          <p className="text-sm text-white/75">
            Est. cost:{" "}
            <strong className="text-[#E8C84A]">
              {meta.id === "manual" || nSel === 0
                ? "$0.00"
                : formatUsd(estCost)}
            </strong>{" "}
            <span className="text-xs text-white/45">({meta.label})</span>
          </p>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={nSel === 0}
              onClick={onStartScan}
              className="rounded-lg border border-violet-500/50 bg-violet-600/35 px-4 py-2 text-sm font-semibold text-violet-50 hover:bg-violet-600/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start Scan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
