import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isSafeReferenceStoragePath, REFERENCE_DOCS_BUCKET } from "@/lib/reference-storage-path";
import { requireTeamMember } from "@/lib/require-reference-auth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXPIRES_IN = 60 * 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireTeamMember();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 },
    );
  }

  const { data: row, error } = await supabase
    .from("reference_documents")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row?.file_path || !isSafeReferenceStoragePath(row.file_path)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data, error: signErr } = await supabase.storage
    .from(REFERENCE_DOCS_BUCKET)
    .createSignedUrl(row.file_path, EXPIRES_IN);

  if (signErr || !data?.signedUrl) {
    return NextResponse.json(
      { error: signErr?.message ?? "Could not sign URL." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    expiresIn: EXPIRES_IN,
  });
}
