import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
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

  const { data: rows, error } = await supabase
    .from("symbol_library")
    .select("*")
    .order("usage_count", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: links, error: linkErr } = await supabase
    .from("symbol_library_projects")
    .select("library_id, project_id");

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 });
  }

  const byLib = new Map<string, string[]>();
  for (const l of links ?? []) {
    const id = l.library_id as string;
    const arr = byLib.get(id) ?? [];
    arr.push(l.project_id as string);
    byLib.set(id, arr);
  }

  const symbols = (rows ?? []).map((r) => ({
    ...r,
    project_ids: byLib.get(r.id) ?? [],
  }));

  return NextResponse.json({ symbols });
}

export async function POST(request: Request) {
  let body: {
    action?: string;
    description?: string;
    category?: string;
    symbolImageBase64?: string | null;
    createdFromProject?: string | null;
    libraryId?: string;
    projectId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action?.trim() ?? "create";

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

  if (action === "importToProject") {
    const libraryId = body.libraryId?.trim();
    const projectId = body.projectId?.trim();
    if (!libraryId || !uuidRe.test(libraryId)) {
      return NextResponse.json({ error: "Invalid libraryId." }, { status: 400 });
    }
    if (!projectId || !uuidRe.test(projectId)) {
      return NextResponse.json({ error: "Invalid projectId." }, { status: 400 });
    }

    const { data: lib, error: libErr } = await supabase
      .from("symbol_library")
      .select("*")
      .eq("id", libraryId)
      .maybeSingle();

    if (libErr) return NextResponse.json({ error: libErr.message }, { status: 500 });
    if (!lib) return NextResponse.json({ error: "Library symbol not found." }, { status: 404 });

    const { data: inserted, error: insErr } = await supabase
      .from("project_symbols")
      .insert({
        project_id: projectId,
        symbol_description: lib.description,
        symbol_category: lib.category,
        confidence: 1,
        source_page: 1,
        user_confirmed: false,
        symbol_image_base64: lib.symbol_image_base64,
        verified_by: "library",
        source_library_id: lib.id,
      })
      .select()
      .maybeSingle();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    await supabase.from("symbol_library_projects").upsert(
      { library_id: libraryId, project_id: projectId },
      { onConflict: "library_id,project_id" },
    );

    const nextUsage = Math.max(0, Number(lib.usage_count ?? 0)) + 1;
    await supabase.from("symbol_library").update({ usage_count: nextUsage }).eq("id", libraryId);

    return NextResponse.json({ symbol: inserted });
  }

  if (action !== "create") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const description = body.description?.trim();
  const category = body.category?.trim();
  if (!description || !category) {
    return NextResponse.json(
      { error: "description and category are required." },
      { status: 400 },
    );
  }

  const createdFromProject = body.createdFromProject?.trim();
  const cf =
    createdFromProject && uuidRe.test(createdFromProject)
      ? createdFromProject
      : null;

  const img =
    typeof body.symbolImageBase64 === "string"
      ? body.symbolImageBase64.trim() || null
      : null;

  const { data, error } = await supabase
    .from("symbol_library")
    .insert({
      description,
      category,
      symbol_image_base64: img,
      created_from_project: cf,
    })
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ symbol: data });
}
