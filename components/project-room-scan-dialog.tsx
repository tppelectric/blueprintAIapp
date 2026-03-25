"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { DetectedRoomRow } from "@/lib/detected-room-types";
import {
  detectedRoomsToWifiInputs,
  WIFI_PREFILL_STORAGE_KEY,
} from "@/lib/room-scan-tool-bridge";
import {
  formatRoomScanBannerDate,
  type ProjectRoomScanListItem,
} from "@/lib/project-room-scans";
import { TPP_COMPANY_FULL } from "@/lib/tpp-branding";
import type { FloorPlanScanApiResponse } from "@/lib/tool-floor-plan-scan";
import {
  floorPlanScanToAvRooms,
  floorPlanScanToElectricalRooms,
  floorPlanScanToSmartHomeRooms,
  floorPlanScanToWifiRooms,
} from "@/lib/tool-floor-plan-scan";

function formatSq(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n >= 1000 ? n.toLocaleString("en-US") : String(Math.round(n));
}

function formatScanLabelDate(d: Date): string {
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `rs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function csvCell(v: string | number): string {
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type LegacyProjectRoomScanDialogProps = {
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
  recalledAt: string | null;
  onSwitchToLive: () => void;
};

export type FloorPlanProjectRoomScanDialogProps = {
  open: boolean;
  onClose: () => void;
  data: FloorPlanScanApiResponse | null;
  scanPage: number;
  projectId: string;
  projectLabel: string;
  autosaveEnabled?: boolean;
  onScansUpdated?: () => void;
  historyScans?: ProjectRoomScanListItem[];
  selectedHistoryId?: string | null;
  onSelectHistoryScan?: (id: string) => void;
  savedAtLabel?: string | null;
};

export function ProjectRoomScanDialog(
  props: LegacyProjectRoomScanDialogProps | FloorPlanProjectRoomScanDialogProps,
) {
  if ("onRunScan" in props) {
    return <LegacyDetectedRoomScanDialog {...props} />;
  }
  return <FloorPlanRoomScanDialogView {...props} />;
}

function LegacyDetectedRoomScanDialog({
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
}: LegacyProjectRoomScanDialogProps) {
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
          totalBuildingSqFt: totalSqft > 0 ? totalSqft : undefined,
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

function FloorPlanRoomScanDialogView({
  open,
  onClose,
  data,
  scanPage,
  projectId,
  projectLabel,
  autosaveEnabled = true,
  onScansUpdated,
  historyScans = [],
  selectedHistoryId,
  onSelectHistoryScan,
  savedAtLabel,
}: FloorPlanProjectRoomScanDialogProps) {
  const router = useRouter();
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const autosaveKeyRef = useRef<string | null>(null);

  const totals = useMemo(() => {
    if (!data?.rooms.length) {
      return { totalSq: 0, floors: 0, roomCount: 0 };
    }
    let totalSq = 0;
    const floorSet = new Set<number>();
    for (const r of data.rooms) {
      if (r.sq_ft != null && r.sq_ft > 0) totalSq += r.sq_ft;
      if (r.floor != null) floorSet.add(Math.round(r.floor));
    }
    const floors =
      floorSet.size > 0 ? Math.max(...floorSet) : data.rooms.length > 0 ? 1 : 0;
    return {
      totalSq: Math.round(totalSq),
      floors,
      roomCount: data.rooms.length,
    };
  }, [data]);

  const payloadFingerprint = useMemo(() => {
    if (!data?.rooms.length) return "";
    return JSON.stringify({
      scanPage,
      rooms: data.rooms,
      notes: data.scan_notes,
      sug: data.equipment_placement_suggestions,
    });
  }, [data, scanPage]);

  useEffect(() => {
    if (!open) {
      autosaveKeyRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !autosaveEnabled || !projectId || !data?.rooms.length) return;
    if (!payloadFingerprint) return;
    if (autosaveKeyRef.current === payloadFingerprint) return;

    let cancelled = false;
    void (async () => {
      try {
        const sb = createBrowserClient();
        const { error } = await sb.from("project_room_scans").insert({
          project_id: projectId,
          rooms_json: data.rooms,
          total_sqft: totals.totalSq,
          floor_count: totals.floors,
          scan_page: scanPage,
          equipment_suggestions_json: data.equipment_placement_suggestions,
          scan_notes: data.scan_notes ?? "",
        });
        if (cancelled) return;
        if (!error) {
          autosaveKeyRef.current = payloadFingerprint;
          onScansUpdated?.();
        }
      } catch {
        /* silent auto-save */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    autosaveEnabled,
    projectId,
    payloadFingerprint,
    data,
    totals.totalSq,
    totals.floors,
    scanPage,
    onScansUpdated,
  ]);

  const csv = useMemo(() => {
    if (!data) return "";
    const lines = [
      [
        "Room Name",
        "Dimensions (L×W ft)",
        "Sq Ft",
        "Floor",
        "Type",
      ].join(","),
    ];
    for (const r of data.rooms) {
      const L = r.length_ft ?? "";
      const W = r.width_ft ?? "";
      const dim = L !== "" && W !== "" ? `${L}x${W}` : "";
      lines.push(
        [
          csvCell(r.room_name),
          csvCell(dim),
          csvCell(r.sq_ft ?? ""),
          csvCell(r.floor ?? ""),
          csvCell(r.room_type),
        ].join(","),
      );
    }
    lines.push("");
    lines.push(`Total sq ft,${totals.totalSq}`);
    lines.push(`Floors,${totals.floors}`);
    lines.push(`Rooms,${totals.roomCount}`);
    return lines.join("\r\n");
  }, [data, totals]);

  const copyTable = useCallback(async () => {
    if (!data) return;
    const rows = data.rooms.map(
      (r) =>
        `${r.room_name}\t${r.length_ft ?? "—"}×${r.width_ft ?? "—"}\t${r.sq_ft ?? "—"}\t${r.floor ?? "—"}\t${r.room_type}`,
    );
    const text = [
      "Room Name\tDimensions\tSq Ft\tFloor\tType",
      ...rows,
      "",
      `Total: ${totals.totalSq} sq ft | ${totals.floors} floors | ${totals.roomCount} rooms`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg("Copied.");
      setTimeout(() => setCopyMsg(null), 2000);
    } catch {
      setCopyMsg("Copy failed");
    }
  }, [data, totals]);

  const printPdf = useCallback(() => {
    if (!data) return;
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) return;
    const d = w.document;
    d.write(
      `<!DOCTYPE html><html><head><title>Room scan — ${TPP_COMPANY_FULL}</title>`,
    );
    d.write(
      "<style>body{font-family:system-ui,sans-serif;padding:28px;color:#111;font-size:12px} h1{font-size:16px;border-bottom:2px solid #E8C84A;padding-bottom:8px} table{border-collapse:collapse;width:100%;margin-top:16px} th,td{border:1px solid #ccc;padding:8px;text-align:left} th{background:#f4f4f4}</style>",
    );
    d.write("</head><body>");
    d.write(`<h1>${TPP_COMPANY_FULL}</h1>`);
    d.write(`<p><strong>${projectLabel}</strong> · Page ${scanPage}</p>`);
    d.write(
      "<table><thead><tr><th>Room</th><th>Dimensions</th><th>Sq Ft</th><th>Floor</th><th>Type</th></tr></thead><tbody>",
    );
    for (const r of data.rooms) {
      const dim =
        r.length_ft != null && r.width_ft != null
          ? `${r.length_ft}×${r.width_ft} ft`
          : "—";
      d.write(
        `<tr><td>${escapeHtml(r.room_name)}</td><td>${escapeHtml(dim)}</td><td>${r.sq_ft ?? "—"}</td><td>${r.floor ?? "—"}</td><td>${escapeHtml(r.room_type)}</td></tr>`,
      );
    }
    d.write("</tbody></table>");
    d.write(
      `<p style="margin-top:20px"><strong>Total:</strong> ${totals.totalSq} sq ft · ${totals.floors} floor(s) · ${totals.roomCount} rooms</p>`,
    );
    if (data.scan_notes) {
      d.write(`<p><strong>Notes:</strong> ${escapeHtml(data.scan_notes)}</p>`);
    }
    d.write("</body></html>");
    d.close();
    w.focus();
    w.print();
  }, [data, projectLabel, scanPage, totals]);

  const pushWifi = useCallback(() => {
    if (!data) return;
    const rooms = floorPlanScanToWifiRooms(data.rooms, newId);
    sessionStorage.setItem(
      "blueprint-room-scan-wifi",
      JSON.stringify({
        rooms,
        projectName: projectLabel,
        totalSqFt: totals.totalSq,
        floors: totals.floors,
      }),
    );
    router.push("/tools/wifi-analyzer");
  }, [data, projectLabel, router, totals.floors, totals.totalSq]);

  const pushAv = useCallback(() => {
    if (!data) return;
    const rooms = floorPlanScanToAvRooms(data.rooms, newId);
    sessionStorage.setItem(
      "blueprint-room-scan-av",
      JSON.stringify({
        rooms,
        projectName: projectLabel,
        totalSqFt: totals.totalSq,
        floors: totals.floors,
      }),
    );
    router.push("/tools/av-analyzer");
  }, [data, projectLabel, router, totals.floors, totals.totalSq]);

  const pushSh = useCallback(() => {
    if (!data) return;
    const rooms = floorPlanScanToSmartHomeRooms(data.rooms, newId);
    sessionStorage.setItem(
      "blueprint-room-scan-smarthome",
      JSON.stringify({
        rooms,
        projectName: projectLabel,
        totalSqFt: totals.totalSq,
        floors: totals.floors,
      }),
    );
    router.push("/tools/smarthome-analyzer");
  }, [data, projectLabel, router, totals.floors, totals.totalSq]);

  const pushElectrical = useCallback(() => {
    if (!data) return;
    const rooms = floorPlanScanToElectricalRooms(data.rooms, newId);
    sessionStorage.setItem(
      "blueprint-room-scan-electrical",
      JSON.stringify({
        rooms,
        projectName: projectLabel,
        totalSqFt: totals.totalSq,
        numFloors: Math.max(1, totals.floors),
      }),
    );
    router.push("/tools/electrical-analyzer");
  }, [data, projectLabel, router, totals.floors, totals.totalSq]);

  if (!open || !data) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-scan-title"
    >
      <div className="flex max-h-[min(92vh,880px)] w-full max-w-4xl flex-col rounded-2xl border border-white/15 bg-[#0a1628] shadow-2xl">
        <div className="flex shrink-0 flex-col gap-2 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="room-scan-title" className="text-lg font-semibold text-white">
              Room scan · Page {scanPage}
              {savedAtLabel ? (
                <span className="ml-2 text-sm font-normal text-white/50">
                  · Saved {savedAtLabel}
                </span>
              ) : null}
            </h2>
            {historyScans.length > 1 && onSelectHistoryScan ? (
              <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60">
                <span>Scan history</span>
                <select
                  value={
                    selectedHistoryId ?? historyScans[0]?.id ?? ""
                  }
                  onChange={(e) => onSelectHistoryScan(e.target.value)}
                  className="max-w-[min(100%,20rem)] rounded-lg border border-white/20 bg-[#071422] px-2 py-1 text-white"
                >
                  {historyScans.map((h) => (
                    <option key={h.id} value={h.id}>
                      {formatRoomScanBannerDate(h.created_at)} · p.{h.scan_page}{" "}
                      · {h.room_count} rooms ·{" "}
                      {(h.total_sqft ?? 0).toLocaleString()} sq ft
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="self-end rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 sm:self-auto"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="text-sm text-white/60">
            Total:{" "}
            <span className="font-semibold text-[#E8C84A]">
              {totals.totalSq.toLocaleString()} sq ft
            </span>{" "}
            · {totals.floors} floor(s) · {totals.roomCount} room(s)
          </p>
          {data.scan_notes ? (
            <p className="mt-2 text-xs text-white/50">{data.scan_notes}</p>
          ) : null}
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[520px] text-left text-sm text-white/85">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.06] text-xs uppercase tracking-wide text-white/55">
                  <th className="px-3 py-2">Room</th>
                  <th className="px-3 py-2">Dimensions</th>
                  <th className="px-3 py-2">Sq Ft</th>
                  <th className="px-3 py-2">Floor</th>
                  <th className="px-3 py-2">Type</th>
                </tr>
              </thead>
              <tbody>
                {data.rooms.map((r, i) => (
                  <tr
                    key={`${r.room_name}-${i}`}
                    className="border-b border-white/5 hover:bg-white/[0.03]"
                  >
                    <td className="px-3 py-2 font-medium text-white">
                      {r.room_name}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-white/70">
                      {r.length_ft != null && r.width_ft != null
                        ? `${r.length_ft}×${r.width_ft} ft`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.sq_ft != null ? Math.round(r.sq_ft) : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.floor ?? "—"}</td>
                    <td className="px-3 py-2 text-white/65">{r.room_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.equipment_placement_suggestions.length > 0 ? (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs font-semibold uppercase text-[#E8C84A]/90">
                Suggestions
              </p>
              <ul className="mt-2 list-inside list-disc text-xs text-white/65">
                {data.equipment_placement_suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `room-scan-page-${scanPage}.csv`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => void copyTable()}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
          >
            Copy to clipboard
          </button>
          <button
            type="button"
            onClick={printPdf}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
          >
            Print / PDF
          </button>
          {copyMsg ? (
            <span className="self-center text-xs text-emerald-300">{copyMsg}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-white/10 px-4 py-3">
          <span className="w-full text-xs font-semibold uppercase text-white/45">
            Send to analyzers
          </span>
          <button
            type="button"
            onClick={pushWifi}
            className="rounded-lg border border-teal-500/40 bg-teal-950/30 px-3 py-2 text-xs font-semibold text-teal-100 hover:bg-teal-950/45"
          >
            Wi‑Fi Analyzer
          </button>
          <button
            type="button"
            onClick={pushAv}
            className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-950/45"
          >
            AV Analyzer
          </button>
          <button
            type="button"
            onClick={pushSh}
            className="rounded-lg border border-cyan-500/40 bg-cyan-950/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-950/45"
          >
            Smart Home Analyzer
          </button>
          <button
            type="button"
            onClick={pushElectrical}
            className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-950/45"
          >
            Electrical Analyzer
          </button>
        </div>
      </div>
    </div>
  );
}
