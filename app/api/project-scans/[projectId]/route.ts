import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { ProjectRoomScanRow } from "@/lib/project-room-scans";
import { parseRoomsJson } from "@/lib/project-room-scans";
import type { ProjectScansPayload, ProjectScansSummary } from "@/lib/project-scans-types";
import { normalizeSavedScanType } from "@/lib/project-scans-types";
import type { SavedScanRow } from "@/lib/saved-scan-types";
import { parseScanItems } from "@/lib/saved-scan-types";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildSummary(
  roomScans: ProjectRoomScanRow[],
  electricalScans: SavedScanRow[],
  fullScans: SavedScanRow[],
): ProjectScansSummary {
  const latestRoom = roomScans[0] ?? null;
  const latestItemsScan = electricalScans[0] ?? fullScans[0] ?? null;

  let totalRooms = 0;
  let totalSqFt = 0;
  if (latestRoom) {
    const rooms = parseRoomsJson(latestRoom.rooms_json);
    totalRooms = rooms.length;
    totalSqFt = latestRoom.total_sqft ?? 0;
  }

  let totalItems = 0;
  if (latestItemsScan) {
    totalItems =
      latestItemsScan.total_items ??
      parseScanItems(latestItemsScan.items_snapshot).length;
  }

  const dates: string[] = [];
  for (const r of roomScans.slice(0, 5)) {
    if (r.created_at) dates.push(r.created_at);
  }
  for (const s of [...electricalScans, ...fullScans].slice(0, 10)) {
    if (s.scan_date) dates.push(s.scan_date);
  }
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
    hasRoomScan: roomScans.length > 0,
    hasElectricalScan: electricalScans.length > 0 || fullScans.length > 0,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const id = projectId?.trim();
  if (!id || !uuidRe.test(id)) {
    return NextResponse.json({ error: "Invalid projectId." }, { status: 400 });
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
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("saved_scans")
      .select("*")
      .eq("project_id", id)
      .order("scan_date", { ascending: false })
      .limit(200),
  ]);

  if (roomRes.error) {
    console.error("[project-scans GET] room", roomRes.error.message);
    return NextResponse.json({ error: roomRes.error.message }, { status: 500 });
  }
  if (savedRes.error) {
    console.error("[project-scans GET] saved", savedRes.error.message);
    return NextResponse.json({ error: savedRes.error.message }, { status: 500 });
  }

  const roomScans = (roomRes.data ?? []) as ProjectRoomScanRow[];
  const allSaved = (savedRes.data ?? []) as SavedScanRow[];

  const electricalScans: SavedScanRow[] = [];
  const fullScans: SavedScanRow[] = [];
  for (const row of allSaved) {
    const t = normalizeSavedScanType(row.scan_type ?? undefined);
    if (t === "full") fullScans.push(row);
    else if (t === "electrical" || t === "target" || t === "room") {
      if (t === "electrical" || t === "target") electricalScans.push(row);
    }
  }

  const latestRoomScan = roomScans[0] ?? null;
  const latestElectricalScan = electricalScans[0] ?? fullScans[0] ?? null;

  const payload: ProjectScansPayload = {
    roomScans,
    electricalScans,
    fullScans,
    latestRoomScan,
    latestElectricalScan,
    summary: buildSummary(roomScans, electricalScans, fullScans),
  };

  return NextResponse.json(payload);
}
