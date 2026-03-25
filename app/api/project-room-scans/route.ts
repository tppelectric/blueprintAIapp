import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId")?.trim();
  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json(
      { error: "Invalid or missing projectId." },
      { status: 400 },
    );
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

  const { data, error } = await supabase
    .from("project_room_scans")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[project-room-scans GET]", error.message, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scans: data ?? [] });
}

export async function POST(request: Request) {
  let body: {
    projectId?: string;
    roomsJson?: unknown[];
    totalSqft?: number;
    floorCount?: number;
    scanPage?: number;
    scanLabel?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json({ error: "Invalid projectId." }, { status: 400 });
  }
  const scanPage = body.scanPage;
  if (
    typeof scanPage !== "number" ||
    !Number.isInteger(scanPage) ||
    scanPage < 1
  ) {
    return NextResponse.json(
      { error: "scanPage must be a positive integer." },
      { status: 400 },
    );
  }
  const roomsJson = Array.isArray(body.roomsJson) ? body.roomsJson : [];
  const totalSqft =
    typeof body.totalSqft === "number" && Number.isFinite(body.totalSqft)
      ? Math.max(0, body.totalSqft)
      : 0;
  const floorCount =
    typeof body.floorCount === "number" &&
    Number.isInteger(body.floorCount) &&
    body.floorCount >= 1 &&
    body.floorCount <= 99
      ? body.floorCount
      : 1;
  const scanLabel = body.scanLabel?.trim();
  if (!scanLabel) {
    return NextResponse.json({ error: "scanLabel is required." }, { status: 400 });
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

  const { data, error } = await supabase
    .from("project_room_scans")
    .insert({
      project_id: projectId,
      rooms_json: roomsJson,
      total_sqft: totalSqft,
      floor_count: floorCount,
      scan_page: scanPage,
      scan_label: scanLabel,
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error("[project-room-scans POST]", error.message, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scan: data });
}

export async function PATCH(request: Request) {
  let body: { id?: string; scanLabel?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id || !uuidRe.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }
  const scanLabel = body.scanLabel?.trim();
  if (!scanLabel) {
    return NextResponse.json({ error: "scanLabel is required." }, { status: 400 });
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

  const { data, error } = await supabase
    .from("project_room_scans")
    .update({ scan_label: scanLabel })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[project-room-scans PATCH]", error.message, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scan: data });
}
