"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { ProjectScansPayload } from "@/lib/project-scans-types";
import { recordPlanScanImport } from "@/lib/plan-scan-import-audit";
import type { ProjectRoomScanRow } from "@/lib/project-room-scans";
import {
  boostAvRoomsFromElectricalItems,
  boostElectricalRoomsFromItems,
  boostSmartHomeFromElectricalItems,
  boostWifiRoomsFromElectricalItems,
  electricalItemsToLoadCalcAppliances,
  formatPlanScanRelativeDate,
  itemsFromSavedScan,
  roomRowToAv,
  roomRowToElectrical,
  roomRowToSmartHome,
  roomRowToWifi,
  type PlanImportTool,
} from "@/lib/scan-import-from-plans";
import type { AvRoomInput } from "@/lib/av-analyzer-engine";
import type { ElectricalRoomInput } from "@/lib/electrical-analyzer-engine";
import type { ElectricalItemRow } from "@/lib/electrical-item-types";
import type { ResidentialApplianceKey } from "@/lib/load-calc-engine";
import type { ShRoomInput } from "@/lib/smarthome-analyzer-engine";
import type { StoriesCount, WifiRoomInput } from "@/lib/wifi-analyzer-engine";

export type PlanImportApplyEvent =
  | {
      tool: "wifi";
      kind: "rooms";
      rooms: WifiRoomInput[];
      totalSqFt: number;
      stories: StoriesCount;
    }
  | { tool: "wifi"; kind: "electrical"; items: ElectricalItemRow[] }
  | {
      tool: "av";
      kind: "rooms";
      rooms: AvRoomInput[];
      totalSqFt: number;
      floors: number;
    }
  | { tool: "av"; kind: "electrical"; items: ElectricalItemRow[] }
  | {
      tool: "smarthome";
      kind: "rooms";
      rooms: ShRoomInput[];
      totalSqFt: number;
      floors: number;
    }
  | { tool: "smarthome"; kind: "electrical"; items: ElectricalItemRow[] }
  | {
      tool: "electrical";
      kind: "rooms";
      rooms: ElectricalRoomInput[];
      totalSqFt: number;
      floors: number;
    }
  | { tool: "electrical"; kind: "electrical"; items: ElectricalItemRow[] }
  | {
      tool: "load_calc";
      kind: "rooms";
      totalSqFt: number;
      roomCount: number;
    }
  | {
      tool: "load_calc";
      kind: "electrical";
      appliances: Partial<
        Record<ResidentialApplianceKey, { enabled: boolean }>
      >;
    };

type ProjectListRow = {
  id: string;
  project_name: string | null;
  file_name: string;
};

function displayName(p: ProjectListRow): string {
  const n = p.project_name?.trim();
  if (n) return n;
  return p.file_name.replace(/\.pdf$/i, "").trim() || p.file_name;
}

type Props = {
  tool: PlanImportTool;
  newId: () => string;
  onApply: (e: PlanImportApplyEvent) => void;
  onSourceProjectLinked?: (projectId: string, displayName: string) => void;
};

export function ImportFromPlansCard({
  tool,
  newId,
  onApply,
  onSourceProjectLinked,
}: Props) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectListRow[]>([]);
  const [summaries, setSummaries] = useState<
    Record<
      string,
      {
        hasRoomScan: boolean;
        hasElectricalScan: boolean;
        lastScanned: string | null;
      }
    >
  >({});
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<ProjectScansPayload | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingList(true);
      try {
        const sb = createBrowserClient();
        const { data, error } = await sb
          .from("projects")
          .select("id, project_name, file_name")
          .order("created_at", { ascending: false })
          .limit(200);
        if (cancelled) return;
        if (error) throw error;
        setProjects((data ?? []) as ProjectListRow[]);
        const ids = (data ?? []).map((p) => p.id as string).filter(Boolean);
        if (ids.length === 0) {
          setSummaries({});
          return;
        }
        const batchRes = await fetch(
          `/api/project-scans/batch?ids=${encodeURIComponent(ids.join(","))}`,
        );
        const bj = (await batchRes.json()) as {
          summaries?: Record<
            string,
            {
              hasRoomScan: boolean;
              hasElectricalScan: boolean;
              lastScanned: string | null;
            }
          >;
        };
        if (!cancelled) setSummaries(bj.summaries ?? {});
      } catch {
        if (!cancelled) {
          setProjects([]);
          setSummaries({});
        }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const withScans = useMemo(() => {
    return projects.filter((p) => {
      const s = summaries[p.id];
      return s?.hasRoomScan || s?.hasElectricalScan;
    });
  }, [projects, summaries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return withScans;
    return withScans.filter((p) =>
      displayName(p).toLowerCase().includes(q),
    );
  }, [withScans, search]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadingDetail(true);
      try {
        const res = await fetch(
          `/api/project-scans/${encodeURIComponent(selectedId)}`,
        );
        const j = (await res.json()) as ProjectScansPayload & { error?: string };
        if (!res.ok) throw new Error(j.error ?? "Could not load scans.");
        if (!cancelled) setDetail(j);
      } catch (e) {
        if (!cancelled) {
          setDetail(null);
          setMsg(e instanceof Error ? e.message : "Load failed.");
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectedProject = projects.find((p) => p.id === selectedId);
  const label = selectedProject ? displayName(selectedProject) : "";

  const itemsScan = detail?.latestElectricalScan ?? null;
  const items = itemsFromSavedScan(itemsScan);

  const audit = useCallback(
    async (importSummary: Record<string, unknown>) => {
      if (!selectedId) return;
      await recordPlanScanImport({
        blueprintProjectId: selectedId,
        toolSlug: tool,
        importSummary,
      });
    },
    [selectedId, tool],
  );

  const runImportRooms = useCallback(async () => {
    setMsg(null);
    if (!detail?.latestRoomScan) {
      setMsg("No room scan found for this project.");
      return;
    }
    const row = detail.latestRoomScan;
    onSourceProjectLinked?.(selectedId, label);
    if (tool === "wifi") {
      const x = roomRowToWifi(row, newId);
      onApply({
        tool: "wifi",
        kind: "rooms",
        rooms: x.rooms,
        totalSqFt: x.totalSqFt,
        stories: x.stories,
      });
    } else if (tool === "av") {
      const x = roomRowToAv(row, newId);
      onApply({
        tool: "av",
        kind: "rooms",
        rooms: x.rooms,
        totalSqFt: x.totalSqFt,
        floors: x.floors,
      });
    } else if (tool === "smarthome") {
      const x = roomRowToSmartHome(row, newId);
      onApply({
        tool: "smarthome",
        kind: "rooms",
        rooms: x.rooms,
        totalSqFt: x.totalSqFt,
        floors: x.floors,
      });
    } else if (tool === "electrical") {
      const x = roomRowToElectrical(row, newId);
      onApply({
        tool: "electrical",
        kind: "rooms",
        rooms: x.rooms,
        totalSqFt: x.totalSqFt,
        floors: x.floors,
      });
    } else {
      const rooms = row.rooms_json;
      const rc = Array.isArray(rooms) ? rooms.length : 0;
      const sq = row.total_sqft ?? 0;
      onApply({
        tool: "load_calc",
        kind: "rooms",
        totalSqFt: Math.max(0, sq),
        roomCount: rc,
      });
    }
    await audit({
      importKind: "rooms",
      roomScanId: row.id,
      roomCount:
        typeof row.rooms_json === "object" && Array.isArray(row.rooms_json)
          ? row.rooms_json.length
          : 0,
    });
  }, [audit, detail, label, newId, onApply, onSourceProjectLinked, selectedId, tool]);

  const runImportElectrical = useCallback(async () => {
    setMsg(null);
    if (!items.length) {
      setMsg("No electrical takeoff snapshot found for this project.");
      return;
    }
    onSourceProjectLinked?.(selectedId, label);
    if (tool === "wifi") {
      onApply({ tool: "wifi", kind: "electrical", items });
    } else if (tool === "av") {
      onApply({ tool: "av", kind: "electrical", items });
    } else if (tool === "smarthome") {
      onApply({ tool: "smarthome", kind: "electrical", items });
    } else if (tool === "electrical") {
      onApply({ tool: "electrical", kind: "electrical", items });
    } else {
      const app = electricalItemsToLoadCalcAppliances(items);
      onApply({ tool: "load_calc", kind: "electrical", appliances: app });
    }
    await audit({
      importKind: "electrical",
      savedScanId: itemsScan?.id ?? null,
      itemCount: items.length,
    });
  }, [
    audit,
    items,
    itemsScan?.id,
    label,
    onApply,
    onSourceProjectLinked,
    selectedId,
    tool,
  ]);

  const runImportBoth = useCallback(async () => {
    setMsg(null);
    if (!detail) return;
    onSourceProjectLinked?.(selectedId, label);

    if (tool === "wifi") {
      if (!detail.latestRoomScan) {
        setMsg("No room scan for combined import.");
        return;
      }
      const x = roomRowToWifi(detail.latestRoomScan, newId);
      const merged = items.length
        ? boostWifiRoomsFromElectricalItems(x.rooms, items)
        : x.rooms;
      onApply({
        tool: "wifi",
        kind: "rooms",
        rooms: merged,
        totalSqFt: x.totalSqFt,
        stories: x.stories,
      });
      await audit({
        importKind: "both",
        roomScanId: detail.latestRoomScan.id,
        itemCount: items.length,
      });
      return;
    }

    if (tool === "av") {
      if (!detail.latestRoomScan) {
        setMsg("No room scan for combined import.");
        return;
      }
      const x = roomRowToAv(detail.latestRoomScan, newId);
      const merged = items.length
        ? boostAvRoomsFromElectricalItems(x.rooms, items)
        : x.rooms;
      onApply({
        tool: "av",
        kind: "rooms",
        rooms: merged,
        totalSqFt: x.totalSqFt,
        floors: x.floors,
      });
      await audit({
        importKind: "both",
        roomScanId: detail.latestRoomScan.id,
        itemCount: items.length,
      });
      return;
    }

    if (tool === "smarthome") {
      if (!detail.latestRoomScan) {
        setMsg("No room scan for combined import.");
        return;
      }
      const x = roomRowToSmartHome(detail.latestRoomScan, newId);
      const merged = items.length
        ? boostSmartHomeFromElectricalItems(x.rooms, items)
        : x.rooms;
      onApply({
        tool: "smarthome",
        kind: "rooms",
        rooms: merged,
        totalSqFt: x.totalSqFt,
        floors: x.floors,
      });
      await audit({
        importKind: "both",
        roomScanId: detail.latestRoomScan.id,
        itemCount: items.length,
      });
      return;
    }

    if (tool === "electrical") {
      if (!detail.latestRoomScan && !items.length) {
        setMsg("Need a room scan and/or electrical snapshot.");
        return;
      }
      if (detail.latestRoomScan) {
        const x = roomRowToElectrical(detail.latestRoomScan, newId);
        const merged = items.length
          ? boostElectricalRoomsFromItems(x.rooms, items)
          : x.rooms;
        onApply({
          tool: "electrical",
          kind: "rooms",
          rooms: merged,
          totalSqFt: x.totalSqFt,
          floors: x.floors,
        });
      } else if (items.length) {
        onApply({ tool: "electrical", kind: "electrical", items });
      }
      await audit({
        importKind: "both",
        roomScanId: detail.latestRoomScan?.id ?? null,
        itemCount: items.length,
      });
      return;
    }

    if (tool === "load_calc") {
      if (detail.latestRoomScan) {
        const row = detail.latestRoomScan;
        const rc = Array.isArray(row.rooms_json) ? row.rooms_json.length : 0;
        const sq = row.total_sqft ?? 0;
        onApply({
          tool: "load_calc",
          kind: "rooms",
          totalSqFt: Math.max(0, sq),
          roomCount: rc,
        });
      }
      if (items.length) {
        const app = electricalItemsToLoadCalcAppliances(items);
        onApply({ tool: "load_calc", kind: "electrical", appliances: app });
      }
      if (!detail.latestRoomScan && !items.length) {
        setMsg("Need a room scan and/or electrical snapshot.");
        return;
      }
      await audit({
        importKind: "both",
        roomScanId: detail.latestRoomScan?.id ?? null,
        itemCount: items.length,
      });
    }
  }, [
    audit,
    detail,
    items,
    label,
    newId,
    onApply,
    onSourceProjectLinked,
    selectedId,
    tool,
  ]);

  const viewPlans = () => {
    if (!selectedId) return;
    window.open(`/project/${selectedId}`, "_blank", "noopener,noreferrer");
  };

  const roomLine = detail?.latestRoomScan
    ? `Room scan: ${detail.summary.totalRooms} rooms | ${detail.summary.totalSqFt.toLocaleString()} sqft ✅`
    : `Room scan: none yet`;

  const elecLine =
    items.length > 0
      ? `Electrical scan: ${items.length} items ✅`
      : `Electrical scan: none yet`;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-white/[0.06] sm:px-5 sm:py-4"
      >
        <div>
          <h2 className="text-sm font-bold text-white">
            📋 Import from Blueprint Plans
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-white/60">
            Use scanned plan data to auto-populate this tool
          </p>
        </div>
        <span className="shrink-0 text-white/50">{open ? "▼" : "▶"}</span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-white/10 px-4 pb-5 pt-3 sm:px-5">
          {loadingList ? (
            <p className="text-xs text-white/50">Loading projects…</p>
          ) : withScans.length === 0 ? (
            <p className="text-xs text-white/55">
              No projects with saved scans yet. Run a room or electrical scan in
              the blueprint viewer, then return here.
            </p>
          ) : (
            <>
              <label className="block text-xs font-medium text-white/70">
                Link a project…
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-sm text-white placeholder:text-white/35"
                />
              </label>
              <select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setMsg(null);
                }}
                className="w-full rounded-lg border border-white/15 bg-[#0a1628] px-3 py-2 text-sm text-white"
              >
                <option value="">Select a project…</option>
                {filtered.map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p)}
                  </option>
                ))}
              </select>
            </>
          )}

          {selectedId && (
            <div className="rounded-xl border border-white/10 bg-[#071422]/80 p-3 text-xs leading-relaxed text-white/80">
              {loadingDetail ? (
                <p className="text-white/50">Loading scan summary…</p>
              ) : (
                <>
                  <p className="font-semibold text-white">
                    {label}
                    {tool === "electrical" ? " — Electrical" : ""}
                  </p>
                  <p className="mt-2">{roomLine}</p>
                  <p className="mt-1">{elecLine}</p>
                  <p className="mt-1 text-white/55">
                    Last scanned:{" "}
                    {formatPlanScanRelativeDate(detail?.summary.lastScanned)}
                  </p>
                </>
              )}
            </div>
          )}

          {msg ? (
            <p className="text-xs text-amber-200/95" role="status">
              {msg}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={!detail?.latestRoomScan}
              onClick={() => void runImportRooms()}
              className="rounded-lg border border-teal-500/45 bg-teal-950/40 px-3 py-2 text-xs font-semibold text-teal-100 hover:bg-teal-950/55 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Import Rooms and Sq Footage
            </button>
            <button
              type="button"
              disabled={!items.length}
              onClick={() => void runImportElectrical()}
              className="rounded-lg border border-amber-500/45 bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-950/55 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Import Electrical Data
            </button>
            <button
              type="button"
              disabled={!detail?.latestRoomScan && !items.length}
              onClick={() => void runImportBoth()}
              className="rounded-lg border border-emerald-500/45 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-950/55 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Import Everything
            </button>
            <button
              type="button"
              disabled={!selectedId}
              onClick={viewPlans}
              className="rounded-lg border border-sky-500/45 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              View Plans
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
