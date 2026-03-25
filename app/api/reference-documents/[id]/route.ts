import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isSafeReferenceStoragePath, REFERENCE_DOCS_BUCKET } from "@/lib/reference-storage-path";
import { requireReferenceAdmin } from "@/lib/require-reference-auth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const adminAuth = await requireReferenceAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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

  const { data: row, error: fetchErr } = await supabase
    .from("reference_documents")
    .select("id,file_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!row?.file_path || !isSafeReferenceStoragePath(row.file_path)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { error: rmErr } = await supabase.storage
    .from(REFERENCE_DOCS_BUCKET)
    .remove([row.file_path]);

  if (rmErr) {
    return NextResponse.json(
      { error: rmErr.message ?? "Storage delete failed." },
      { status: 502 },
    );
  }

  const { error: delErr } = await supabase
    .from("reference_documents")
    .delete()
    .eq("id", id);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
