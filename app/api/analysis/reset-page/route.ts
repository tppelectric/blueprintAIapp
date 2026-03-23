import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  let body: { projectId?: string; pageNumber?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const pageNumber = body.pageNumber;

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json({ error: "Invalid projectId." }, { status: 400 });
  }
  if (
    typeof pageNumber !== "number" ||
    !Number.isInteger(pageNumber) ||
    pageNumber < 1
  ) {
    return NextResponse.json({ error: "Invalid pageNumber." }, { status: 400 });
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

  const { error: itemErr } = await supabase
    .from("electrical_items")
    .delete()
    .eq("project_id", projectId)
    .eq("page_number", pageNumber);

  if (itemErr) {
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }

  const { error: roomErr } = await supabase
    .from("detected_rooms")
    .delete()
    .eq("project_id", projectId)
    .eq("page_number", pageNumber);

  if (roomErr) {
    return NextResponse.json({ error: roomErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
