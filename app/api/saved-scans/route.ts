import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId")?.trim();
  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json({ error: "Invalid or missing projectId." }, { status: 400 });
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
    .from("saved_scans")
    .select("*")
    .eq("project_id", projectId)
    .order("scan_date", { ascending: false });

  if (error) {
    console.error(
      "[saved-scans GET]",
      error.message,
      error.details,
      error.hint,
      error.code,
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scans: data ?? [] });
}

export async function POST(request: Request) {
  let body: {
    projectId?: string;
    pageNumber?: number;
    scanName?: string;
    itemsSnapshot?: unknown[];
    roomsSnapshot?: unknown[];
    totalItems?: number;
    notes?: string | null;
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
  const pageNumber = body.pageNumber;
  if (
    typeof pageNumber !== "number" ||
    !Number.isInteger(pageNumber) ||
    pageNumber < 1
  ) {
    return NextResponse.json(
      { error: "pageNumber must be a positive integer." },
      { status: 400 },
    );
  }
  const scanName = body.scanName?.trim();
  if (!scanName) {
    return NextResponse.json({ error: "scanName is required." }, { status: 400 });
  }

  const itemsSnapshot = Array.isArray(body.itemsSnapshot) ? body.itemsSnapshot : [];
  const roomsSnapshot = Array.isArray(body.roomsSnapshot) ? body.roomsSnapshot : [];
  const totalItems =
    typeof body.totalItems === "number" && body.totalItems >= 0
      ? body.totalItems
      : itemsSnapshot.length;

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
    .from("saved_scans")
    .insert({
      project_id: projectId,
      page_number: pageNumber,
      scan_name: scanName,
      scan_date: new Date().toISOString(),
      items_snapshot: itemsSnapshot,
      rooms_snapshot: roomsSnapshot,
      total_items: totalItems,
      notes: body.notes?.trim() || null,
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error(
      "[saved-scans POST] insert failed:",
      error.message,
      error.details,
      error.hint,
      error.code,
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scan: data });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id || !uuidRe.test(id)) {
    return NextResponse.json({ error: "Invalid or missing id." }, { status: 400 });
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

  const { error } = await supabase.from("saved_scans").delete().eq("id", id);

  if (error) {
    console.error("[saved-scans DELETE]", error.message, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  let body: { id?: string; notes?: string | null; scanName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id || !uuidRe.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const notes =
    body.notes === null || body.notes === undefined
      ? undefined
      : String(body.notes).trim() || null;

  const scanNameRaw = body.scanName?.trim();
  const scanName =
    scanNameRaw === undefined ? undefined : scanNameRaw || undefined;
  if (scanName !== undefined && !scanName) {
    return NextResponse.json(
      { error: "scanName cannot be empty." },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};
  if (notes !== undefined) patch.notes = notes;
  if (scanName !== undefined) patch.scan_name = scanName;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Provide notes and/or scanName to update." },
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
    .from("saved_scans")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[saved-scans PATCH]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scan: data });
}
