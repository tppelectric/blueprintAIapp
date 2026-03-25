import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { ProjectRoomScanRow } from "@/lib/project-room-scans";
import { parseRoomsJson } from "@/lib/project-room-scans";
import type { ProjectScansSummary } from "@/lib/project-scans-types";
import { normalizeSavedScanType } from "@/lib/project-scans-types";
import type { SavedScanRow } from "@/lib/saved-scan-types";
import { parseScanItems } from "@/lib/saved-scan-types";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_IDS = 80;

function cardSummary(
  roomRows: ProjectRoomScanRow[],
  savedRows: SavedScanRow[],
): ProjectScansSummary {
  const latestRoom = roomRows[0] ?? null;
  const electricalScans: SavedScanRow[] = [];
  const fullScans: SavedScanRow[] = [];
  for (const row of savedRows) {
    const t = normalizeSavedScanType(row.scan_type ?? undefined);
    if (t === "full") fullScans.push(row);
    else if (t === "electrical" || t === "target") electricalScans.push(row);
  }
  const latestItems = electricalScans[0] ?? fullScans[0] ?? null;

  let totalRooms = 0;
  let totalSqFt = 0;
  if (latestRoom) {
    totalRooms = parseRoomsJson(latestRoom.rooms_json).length;
    totalSqFt = latestRoom.total_sqft ?? 0;
  }
  let totalItems = 0;
  if (latestItems) {
    totalItems =
      latestItems.total_items ??
      parseScanItems(latestItems.items_snapshot).length;
  }

  const dates: string[] = [];
  if (latestRoom?.created_at) dates.push(latestRoom.created_at);
  if (latestItems?.scan_date) dates.push(latestItems.scan_date);
  const times = dates
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));
  const lastScanned =
    times.length === 0 ? null : new Date(Math.max(...times)).toISOString();

  return {
    totalRooms,
    totalSqFt,
    totalItems,
    lastScanned,
    hasRoomScan: roomRows.length > 0,
    hasElectricalScan: electricalScans.length > 0 || fullScans.length > 0,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("ids")?.trim();
  if (!raw) {
    return NextResponse.json({ summaries: {} as Record<string, ProjectScansSummary> });
  }

  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => uuidRe.test(s))
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json({ summaries: {} });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Supabase service client is not configured.",
      },
      { status: 500 },
    );
  }

  const [roomRes, savedRes] = await Promise.all([
    supabase
      .from("project_room_scans")
      .select("*")
      .in("project_id", ids)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("saved_scans")
      .select("*")
      .in("project_id", ids)
      .order("scan_date", { ascending: false })
      .limit(800),
  ]);

  if (roomRes.error) {
    return NextResponse.json({ error: roomRes.error.message }, { status: 500 });
  }
  if (savedRes.error) {
    return NextResponse.json({ error: savedRes.error.message }, { status: 500 });
  }

  const byProjectRooms = new Map<string, ProjectRoomScanRow[]>();
  for (const row of (roomRes.data ?? []) as ProjectRoomScanRow[]) {
    const list = byProjectRooms.get(row.project_id) ?? [];
    list.push(row);
    byProjectRooms.set(row.project_id, list);
  }

  const byProjectSaved = new Map<string, SavedScanRow[]>();
  for (const row of (savedRes.data ?? []) as SavedScanRow[]) {
    const list = byProjectSaved.get(row.project_id) ?? [];
    list.push(row);
    byProjectSaved.set(row.project_id, list);
  }

  const summaries: Record<string, ProjectScansSummary> = {};
  for (const pid of ids) {
    const rooms = byProjectRooms.get(pid) ?? [];
    const saved = byProjectSaved.get(pid) ?? [];
    rooms.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    saved.sort(
      (a, b) =>
        new Date(b.scan_date).getTime() - new Date(a.scan_date).getTime(),
    );
    summaries[pid] = cardSummary(rooms, saved);
  }

  return NextResponse.json({ summaries });
}
