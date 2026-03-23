import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let body: { projectId?: string; projectName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const name = body.projectName?.trim();
  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json({ error: "Invalid projectId." }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Project name cannot be empty." }, { status: 400 });
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

  const { data, error } = await supabase
    .from("projects")
    .update({ project_name: name })
    .eq("id", projectId)
    .select("id, project_name")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, project: data });
}
