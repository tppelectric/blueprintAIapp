import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { normalizeBlueprintStoragePath } from "@/lib/storage-path";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BUCKET = "blueprints";

export const POST = withAuth(async (request: NextRequest, _ctx) => {
  let body: { projectId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json({ error: "Invalid projectId." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Supabase not configured." },
      { status: 500 },
    );
  }

  const { error: e1 } = await supabase
    .from("electrical_items")
    .delete()
    .eq("project_id", projectId);
  if (e1) {
    return NextResponse.json(
      { error: e1.message, step: "electrical_items" },
      { status: 500 },
    );
  }

  const { error: e2 } = await supabase
    .from("detected_rooms")
    .delete()
    .eq("project_id", projectId);
  if (e2) {
    return NextResponse.json(
      { error: e2.message, step: "detected_rooms" },
      { status: 500 },
    );
  }

  const { error: e3 } = await supabase
    .from("symbol_corrections")
    .delete()
    .eq("project_id", projectId);
  if (e3) {
    return NextResponse.json(
      { error: e3.message, step: "symbol_corrections" },
      { status: 500 },
    );
  }

  const { data: sheetRows, error: sheetFetchErr } = await supabase
    .from("sheets")
    .select("file_url")
    .eq("project_id", projectId);

  if (sheetFetchErr) {
    return NextResponse.json(
      { error: sheetFetchErr.message, step: "sheets_fetch" },
      { status: 500 },
    );
  }

  const { data: projectRow, error: projFetchErr } = await supabase
    .from("projects")
    .select("file_url")
    .eq("id", projectId)
    .maybeSingle();

  if (projFetchErr) {
    return NextResponse.json(
      { error: projFetchErr.message, step: "project_fetch" },
      { status: 500 },
    );
  }

  const { error: e4 } = await supabase
    .from("sheets")
    .delete()
    .eq("project_id", projectId);
  if (e4) {
    return NextResponse.json(
      { error: e4.message, step: "sheets_delete" },
      { status: 500 },
    );
  }

  const pathSet = new Set<string>();
  for (const row of sheetRows ?? []) {
    const u = row.file_url;
    if (typeof u === "string" && u.trim()) {
      const p = normalizeBlueprintStoragePath(u);
      if (p && !p.startsWith("http")) pathSet.add(p);
    }
  }
  if (projectRow?.file_url && typeof projectRow.file_url === "string") {
    const p = normalizeBlueprintStoragePath(projectRow.file_url);
    if (p && !p.startsWith("http")) pathSet.add(p);
  }

  const paths = [...pathSet];
  if (paths.length > 0) {
    const { error: stErr } = await supabase.storage.from(BUCKET).remove(paths);
    if (stErr) {
      return NextResponse.json(
        { error: stErr.message, step: "storage" },
        { status: 500 },
      );
    }
  }

  const { error: e5 } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId);
  if (e5) {
    return NextResponse.json(
      { error: e5.message, step: "project" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
});
