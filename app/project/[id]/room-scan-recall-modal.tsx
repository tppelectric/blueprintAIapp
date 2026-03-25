"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProjectRoomScanRow } from "@/lib/project-room-scans";

function formatScanDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function formatSq(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n >= 1000 ? n.toLocaleString("en-US") : String(Math.round(n));
}

export function RoomScanRecallModal({
  open,
  onClose,
  projectId,
  reloadToken,
  onPickScan,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  reloadToken: number;
  onPickScan: (scan: ProjectRoomScanRow) => void;
}) {
  const [scans, setScans] = useState<ProjectRoomScanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/project-room-scans?projectId=${encodeURIComponent(projectId)}`,
      );
      const json = (await res.json()) as {
        scans?: ProjectRoomScanRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load room scans.");
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[228] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-white/15 bg-[#071422] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-recall-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
          <h2
            id="room-recall-title"
            className="text-lg font-semibold text-white"
          >
            Recall room scan
          </h2>
          <div className="flex gap-2">
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
          {error ? <p className="text-sm text-red-200">{error}</p> : null}
          {!loading && !error && scans.length === 0 ? (
            <p className="text-sm text-white/60">No saved room scans yet.</p>
          ) : null}
          <ul className="space-y-3">
            {scans.map((scan) => {
              const roomCount = Array.isArray(scan.rooms_json)
                ? scan.rooms_json.length
                : 0;
              return (
                <li
                  key={scan.id}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <p className="font-semibold text-white">{scan.scan_label}</p>
                  <p className="mt-1 text-xs text-white/55">
                    {formatScanDate(scan.created_at)} · Page {scan.scan_page} ·{" "}
                    {roomCount} room{roomCount === 1 ? "" : "s"} ·{" "}
                    {formatSq(Number(scan.total_sqft))} sq ft · {scan.floor_count}{" "}
                    floor{scan.floor_count === 1 ? "" : "s"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onPickScan(scan);
                      onClose();
                    }}
                    className="mt-3 rounded-lg border border-teal-500/40 bg-teal-500/20 px-3 py-1.5 text-xs font-semibold text-teal-100 hover:bg-teal-500/30"
                  >
                    Load this scan
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
