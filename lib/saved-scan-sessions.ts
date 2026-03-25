import type { SavedScanRow } from "@/lib/saved-scan-types";
import {
  parseScanItems,
  parseScanRooms,
} from "@/lib/saved-scan-types";

export const RECALL_SCAN_STORAGE_PREFIX = "blueprint-recall-scan:";

export function recallScanStorageKey(projectId: string): string {
  return `${RECALL_SCAN_STORAGE_PREFIX}${projectId}`;
}

export type SavedScanSession = {
  /** Stable id: sorted row ids joined by comma */
  id: string;
  rows: SavedScanRow[];
  /** Primary label (shared scan name or composite) */
  label: string;
  scanDate: string;
  pageCount: number;
  /** Sum of per-row total_items (line items in DB snapshot) */
  totalItemLines: number;
  scanMode: string | null;
  pages: number[];
};

const DEFAULT_CLUSTER_GAP_MS = 120_000;

function sessionFromCluster(groupRows: SavedScanRow[]): SavedScanSession {
  const id = [...new Set(groupRows.map((r) => r.id))].sort().join(",");
  const pages = [...new Set(groupRows.map((r) => r.page_number))].sort(
    (a, b) => a - b,
  );
  const totalItemLines = groupRows.reduce(
    (s, r) => s + Math.max(0, Math.round(Number(r.total_items) || 0)),
    0,
  );
  const latest = groupRows.reduce((a, b) =>
    new Date(a.scan_date).getTime() >= new Date(b.scan_date).getTime() ? a : b,
  );
  const names = [...new Set(groupRows.map((r) => r.scan_name.trim()))];
  const label =
    names.length === 1
      ? names[0]!
      : `${latest.scan_name} · ${groupRows.length} saves`;
  const modeHit = groupRows.find((r) => r.scan_mode?.trim());
  return {
    id,
    rows: groupRows,
    label,
    scanDate: latest.scan_date,
    pageCount: pages.length,
    totalItemLines,
    scanMode: modeHit?.scan_mode?.trim() ?? null,
    pages,
  };
}

/** Group rows that were saved close in time (e.g. same batch run). */
export function clusterSavedScansIntoSessions(
  rows: SavedScanRow[],
  gapMs = DEFAULT_CLUSTER_GAP_MS,
): SavedScanSession[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort(
    (a, b) =>
      new Date(a.scan_date).getTime() - new Date(b.scan_date).getTime(),
  );
  const clusters: SavedScanRow[][] = [];
  let cur: SavedScanRow[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const row = sorted[i]!;
    const dt =
      new Date(row.scan_date).getTime() - new Date(prev.scan_date).getTime();
    if (dt <= gapMs && dt >= 0) {
      cur.push(row);
    } else {
      clusters.push(cur);
      cur = [row];
    }
  }
  clusters.push(cur);
  return clusters.map((g) => sessionFromCluster(g));
}

/** Newest row per page wins when merging snapshot data. */
export function mergeSessionItemsAndRooms(sessionRows: SavedScanRow[]) {
  const byPage = new Map<number, SavedScanRow>();
  const chronological = [...sessionRows].sort(
    (a, b) =>
      new Date(a.scan_date).getTime() - new Date(b.scan_date).getTime(),
  );
  for (const r of chronological) {
    byPage.set(r.page_number, r);
  }
  const items = [];
  const rooms = [];
  const pages = [...byPage.keys()].sort((a, b) => a - b);
  for (const p of pages) {
    const r = byPage.get(p)!;
    items.push(...parseScanItems(r.items_snapshot));
    rooms.push(...parseScanRooms(r.rooms_snapshot));
  }
  return { items, rooms };
}

/** Sidebar recall: ✅ items, ⚠️ scanned empty, ○ not in session */
export type RecallThumbStatus = "ok" | "warn" | "wait";

export function recallThumbMaps(
  numPages: number,
  session: SavedScanSession,
): {
  statusByPage: Record<number, RecallThumbStatus>;
  itemCountByPage: Record<number, number | null>;
} {
  const byPage = new Map<number, number>();
  const chronological = [...session.rows].sort(
    (a, b) =>
      new Date(a.scan_date).getTime() - new Date(b.scan_date).getTime(),
  );
  for (const r of chronological) {
    const n = parseScanItems(r.items_snapshot).length;
    byPage.set(r.page_number, n);
  }
  const statusByPage: Record<number, RecallThumbStatus> = {};
  const itemCountByPage: Record<number, number | null> = {};
  for (let p = 1; p <= numPages; p++) {
    if (!byPage.has(p)) {
      statusByPage[p] = "wait";
      itemCountByPage[p] = null;
    } else {
      const c = byPage.get(p)!;
      itemCountByPage[p] = c;
      statusByPage[p] = c > 0 ? "ok" : "warn";
    }
  }
  return { statusByPage, itemCountByPage };
}

export function formatRecallSessionDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
