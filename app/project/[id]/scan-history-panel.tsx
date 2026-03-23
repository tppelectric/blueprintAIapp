"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildScanCsv,
  buildScanPlainText,
  copyScanTextToClipboard,
  downloadTextFile,
  openScanPrintableReport,
} from "@/lib/scan-export";
import type { SavedScanRow } from "@/lib/saved-scan-types";
import { ScanCompareModal } from "./scan-compare-modal";

function formatScanDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function ScanHistoryPanel({
  open,
  onClose,
  projectId,
  projectName,
  onViewScan,
  reloadToken,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  onViewScan: (scan: SavedScanRow) => void;
  /** Increment to refetch scans from parent */
  reloadToken: number;
}) {
  const [scans, setScans] = useState<SavedScanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<SavedScanRow | null>(null);
  const [compareB, setCompareB] = useState<SavedScanRow | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [exportKey, setExportKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/saved-scans?projectId=${encodeURIComponent(projectId)}`,
      );
      const json = (await res.json()) as {
        scans?: SavedScanRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load scans.");
      setScans(json.scans ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed.");
      setScans([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load, reloadToken]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const saveNotes = useCallback(
    async (id: string, notes: string) => {
      try {
        const res = await fetch("/api/saved-scans", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, notes }),
        });
        const json = (await res.json()) as { scan?: SavedScanRow; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Save notes failed.");
        if (json.scan) {
          setScans((prev) => prev.map((s) => (s.id === id ? json.scan! : s)));
        }
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Save failed.");
      }
    },
    [],
  );

  const deleteScan = useCallback(
    async (id: string) => {
      if (
        !window.confirm(
          "Delete this saved scan? This cannot be undone.",
        )
      ) {
        return;
      }
      try {
        const res = await fetch(
          `/api/saved-scans?id=${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Delete failed.");
        setScans((prev) => prev.filter((s) => s.id !== id));
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "Delete failed.");
      }
    },
    [],
  );

  const openCompare = useCallback((a: SavedScanRow, bId: string) => {
    const b = scans.find((s) => s.id === bId);
    if (!b) return;
    setCompareA(a);
    setCompareB(b);
    setCompareOpen(true);
  }, [scans]);

  const runExport = useCallback(
    (scan: SavedScanRow, kind: string) => {
      const n = scan.notes?.trim() ?? "";
      if (kind === "csv") {
        const csv = buildScanCsv(scan, n);
        downloadTextFile(
          `${sanitizeFilename(scan.scan_name)}.csv`,
          csv,
          "text/csv;charset=utf-8",
        );
      } else if (kind === "text") {
        const t = buildScanPlainText(scan, projectName);
        downloadTextFile(
          `${sanitizeFilename(scan.scan_name)}.txt`,
          t,
          "text/plain;charset=utf-8",
        );
      } else if (kind === "pdf") {
        openScanPrintableReport(scan, projectName);
      } else if (kind === "copy") {
        void copyScanTextToClipboard(buildScanPlainText(scan, projectName)).then(
          () => window.alert("Copied summary to clipboard."),
          () => window.alert("Clipboard not available."),
        );
      }
      setExportKey((k) => k + 1);
    },
    [projectName],
  );

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[215] flex justify-end bg-black/55 backdrop-blur-sm"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <aside
          className="flex h-full w-full max-w-lg flex-col border-l border-white/15 bg-[#071422] shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="scan-history-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
            <h2
              id="scan-history-title"
              className="text-lg font-semibold text-white"
            >
              Scan history
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/15"
              >
                Close
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {loading && scans.length === 0 ? (
              <p className="text-sm text-white/60">Loading…</p>
            ) : null}
            {error ? (
              <p className="text-sm text-red-200">{error}</p>
            ) : null}
            {!loading && !error && scans.length === 0 ? (
              <p className="text-sm text-white/60">No saved scans yet.</p>
            ) : null}
            <ul className="space-y-4">
              {scans.map((scan) => (
                <li
                  key={scan.id}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">
                        {scan.scan_name}
                      </p>
                      <p className="text-xs text-white/55">
                        {formatScanDate(scan.scan_date)} · Page{" "}
                        {scan.page_number} · {scan.total_items} item line(s)
                      </p>
                    </div>
                  </div>
                  <label className="mt-2 block text-xs text-white/60">
                    Notes
                    <textarea
                      defaultValue={scan.notes ?? ""}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-2 py-1.5 text-sm text-white"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (scan.notes ?? "").trim()) {
                          void saveNotes(scan.id, v);
                        }
                      }}
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onViewScan(scan)}
                      className="rounded-lg border border-sky-500/40 bg-sky-500/20 px-2.5 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-500/30"
                    >
                      View
                    </button>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] uppercase tracking-wide text-white/45">
                        Compare with
                      </span>
                      <select
                        className="max-w-[10rem] rounded border border-white/20 bg-[#0a1628] px-2 py-1 text-xs text-white"
                        defaultValue=""
                        onChange={(e) => {
                          const v = e.target.value;
                          e.target.value = "";
                          if (v) openCompare(scan, v);
                        }}
                      >
                        <option value="">Select scan…</option>
                        {scans
                          .filter((s) => s.id !== scan.id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.scan_name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteScan(scan.id)}
                      className="rounded-lg border border-red-500/35 bg-red-950/35 px-2.5 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-950/50"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 border-t border-white/10 pt-2">
                    <span className="w-full text-[10px] uppercase tracking-wide text-white/45">
                      Export
                    </span>
                    <select
                      key={`${scan.id}-${exportKey}`}
                      className="rounded border border-white/20 bg-[#0a1628] px-2 py-1 text-xs text-white"
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value;
                        e.target.value = "";
                        if (v) runExport(scan, v);
                      }}
                    >
                      <option value="">Choose format…</option>
                      <option value="pdf">PDF report (print)</option>
                      <option value="csv">CSV / Excel</option>
                      <option value="text">Word / text file</option>
                      <option value="copy">Copy to clipboard</option>
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
      <ScanCompareModal
        open={compareOpen}
        onClose={() => {
          setCompareOpen(false);
          setCompareA(null);
          setCompareB(null);
        }}
        scanA={compareA}
        scanB={compareB}
      />
    </>
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 80) || "scan";
}
