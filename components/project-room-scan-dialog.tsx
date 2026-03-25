"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { DetectedRoomRow } from "@/lib/detected-room-types";
import {
  detectedRoomsToWifiInputs,
  WIFI_PREFILL_STORAGE_KEY,
} from "@/lib/room-scan-tool-bridge";

function formatSq(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n >= 1000 ? n.toLocaleString("en-US") : String(Math.round(n));
}

function formatScanLabelDate(d: Date): string {
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export function ProjectRoomScanDialog({
  open,
  onClose,
  projectId,
  pageNumber,
  projectName,
  rooms,
  floorCount,
  totalSqft,
  scanning,
  scanError,
  onRunScan,
  recalledAt,
  onSwitchToLive,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  pageNumber: number;
  projectName: string;
  rooms: DetectedRoomRow[];
  floorCount: number;
  totalSqft: number;
  scanning: boolean;
  scanError: string | null;
  onRunScan: () => void;
  /** ISO date when viewing a recalled scan (not live DB view). */
  recalledAt: string | null;
  onSwitchToLive: () => void;
}) {
  const [copyDone, setCopyDone] = useState(false);

  const sendToWifi = useCallback(() => {
    const mapped = detectedRoomsToWifiInputs(rooms, floorCount);
    const stories = Math.min(4, Math.max(1, Math.round(floorCount))) as
      | 1
      | 2
      | 3
      | 4;
    try {
      sessionStorage.setItem(
        WIFI_PREFILL_STORAGE_KEY,
        JSON.stringify({
          rooms: mapped,
          stories,
          totalBuildingSqFt:
            totalSqft > 0 ? totalSqft : undefined,
        }),
      );
    } catch {
      window.alert("Could not store room data for Wi‑Fi Analyzer.");
      return;
    }
    window.location.href = "/tools/wifi-analyzer";
  }, [rooms, floorCount, totalSqft]);

  const copyJson = useCallback(() => {
    const payload = {
      projectId,
      pageNumber,
      projectName,
      floorCount,
      totalSqft,
      rooms,
    };
    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(
      () => {
        setCopyDone(true);
        window.setTimeout(() => setCopyDone(false), 2000);
      },
      () => window.alert("Clipboard not available."),
    );
  }, [projectId, pageNumber, projectName, floorCount, totalSqft, rooms]);

  if (!open) return null;

  const recallDate =
    recalledAt != null ? formatScanLabelDate(new Date(recalledAt)) : null;

  return (
    <div
      className="fixed inset-0 z-[230] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !scanning) onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-white/15 bg-[#0a1628] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-scan-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-white/10 px-5 py-4">
          <h2
            id="room-scan-dialog-title"
            className="text-lg font-semibold text-white"
          >
            Room scan — page {pageNumber}
          </h2>
          {recallDate ? (
            <p className="mt-1 text-xs text-amber-200/90">
              Historical snapshot · {recallDate}
            </p>
          ) : (
            <p className="mt-1 text-xs text-white/55">
              Live data from this project (saved to history after each scan).
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {scanError ? (
            <p className="mb-3 text-sm text-red-200">{scanError}</p>
          ) : null}

          <div className="mb-4 flex flex-wrap gap-2 text-sm text-white/80">
            <span className="rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1">
              {rooms.length} room{rooms.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1">
              {formatSq(totalSqft)} sq ft total
            </span>
            <span className="rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1">
              {floorCount} floor{floorCount === 1 ? "" : "s"} (estimate)
            </span>
          </div>

          {rooms.length === 0 ? (
            <p className="text-sm text-white/60">
              No rooms on this page yet. Run a room scan to detect spaces and
              square footage.
            </p>
          ) : (
            <ul className="space-y-2 text-sm text-white/85">
              {rooms.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2"
                >
                  <span className="font-medium text-white">{r.room_name}</span>
                  <span className="text-white/50"> · {r.room_type}</span>
                  {r.sq_ft != null && Number(r.sq_ft) > 0 ? (
                    <span className="text-white/60">
                      {" "}
                      · ~{formatSq(Number(r.sq_ft))} sq ft
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 border-t border-white/10 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
              Send to tools
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={rooms.length === 0}
                onClick={sendToWifi}
                className="rounded-lg border border-violet-500/40 bg-violet-500/20 px-3 py-2 text-left text-sm font-semibold text-violet-100 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-violet-500/30"
              >
                Open Wi‑Fi Analyzer (prefill rooms)
              </button>
              <Link
                href="/tools/load-calculator"
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-center text-sm font-medium text-white hover:bg-white/15"
              >
                Open Load Calculator
              </Link>
              <Link
                href="/tools/nec-checker"
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-center text-sm font-medium text-white hover:bg-white/15"
              >
                Open NEC Checker
              </Link>
              <button
                type="button"
                onClick={copyJson}
                disabled={rooms.length === 0}
                className="rounded-lg border border-sky-500/35 bg-sky-950/30 px-3 py-2 text-sm font-medium text-sky-100 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-sky-950/45"
              >
                {copyDone ? "Copied JSON" : "Copy room data (JSON)"}
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 flex flex-col gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:flex-wrap sm:justify-end">
          {recalledAt ? (
            <button
              type="button"
              onClick={onSwitchToLive}
              className="rounded-lg border border-emerald-500/45 bg-emerald-600/80 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500/90"
            >
              Switch to Live Scan
            </button>
          ) : null}
          {!recalledAt ? (
            <button
              type="button"
              disabled={scanning}
              onClick={onRunScan}
              className="rounded-lg border border-teal-500/45 bg-teal-600/80 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500/90 disabled:opacity-50"
            >
              {scanning ? "Scanning…" : "Run room scan"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={scanning}
            onClick={onClose}
            className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
