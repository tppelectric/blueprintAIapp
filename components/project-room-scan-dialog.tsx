"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { TPP_COMPANY_FULL } from "@/lib/tpp-branding";
import type { FloorPlanScanApiResponse } from "@/lib/tool-floor-plan-scan";
import {
  floorPlanScanToAvRooms,
  floorPlanScanToSmartHomeRooms,
  floorPlanScanToWifiRooms,
} from "@/lib/tool-floor-plan-scan";

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

export function ProjectRoomScanDialog({
  open,
  onClose,
  data,
  scanPage,
  projectId,
  projectLabel,
}: {
  open: boolean;
  onClose: () => void;
  data: FloorPlanScanApiResponse | null;
  scanPage: number;
  projectId: string;
  projectLabel: string;
}) {
  const router = useRouter();
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

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
    d.write(
      `<p><strong>${projectLabel}</strong> · Page ${scanPage}</p>`,
    );
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

  const saveToProject = useCallback(async () => {
    if (!data) return;
    setSaveBusy(true);
    setSaveMsg(null);
    try {
      const sb = createBrowserClient();
      const { error } = await sb.from("project_room_scans").insert({
        project_id: projectId,
        rooms_json: data.rooms,
        total_sqft: totals.totalSq,
        floor_count: totals.floors,
        scan_page: scanPage,
      });
      if (error) throw error;
      setSaveMsg("Saved to project.");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaveBusy(false);
    }
  }, [data, projectId, scanPage, totals.floors, totals.totalSq]);

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

  if (!open || !data) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-scan-title"
    >
      <div className="flex max-h-[min(92vh,880px)] w-full max-w-4xl flex-col rounded-2xl border border-white/15 bg-[#0a1628] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <h2 id="room-scan-title" className="text-lg font-semibold text-white">
            Room scan · Page {scanPage}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
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
          <button
            type="button"
            disabled={saveBusy}
            onClick={() => void saveToProject()}
            className="rounded-lg border border-emerald-500/45 bg-emerald-950/35 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-950/50 disabled:opacity-50"
          >
            {saveBusy ? "Saving…" : "Save to project"}
          </button>
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
          {copyMsg ? (
            <span className="self-center text-xs text-emerald-300">{copyMsg}</span>
          ) : null}
          {saveMsg ? (
            <span className="self-center text-xs text-white/70">{saveMsg}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
