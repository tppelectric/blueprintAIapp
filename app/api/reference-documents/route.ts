import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  isReferenceDocCategory,
  type ReferenceDocumentRow,
} from "@/lib/reference-doc-types";
import {
  buildReferenceDocObjectPath,
  isSafeReferenceStoragePath,
  REFERENCE_DOCS_BUCKET,
} from "@/lib/reference-storage-path";
import { requireReferenceAdmin, requireTeamMember } from "@/lib/require-reference-auth";

const MAX_BYTES = 52_428_800; // 50 MiB

function isPdfMagic(buf: Uint8Array): boolean {
  return (
    buf.length >= 5 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46 &&
    buf[4] === 0x2d
  );
}

function mapRow(r: Record<string, unknown>): ReferenceDocumentRow | null {
  const id = typeof r.id === "string" ? r.id : null;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const cat = isReferenceDocCategory(r.category as string)
    ? (r.category as ReferenceDocumentRow["category"])
    : null;
  const file_path = typeof r.file_path === "string" ? r.file_path : null;
  const uploaded_by =
    typeof r.uploaded_by === "string" ? r.uploaded_by : null;
  const created_at =
    typeof r.created_at === "string" ? r.created_at : null;
  const file_size =
    typeof r.file_size === "number" && r.file_size >= 0 ? r.file_size : null;
  if (!id || !title || !cat || !file_path || !uploaded_by || !created_at || file_size == null) {
    return null;
  }
  if (!isSafeReferenceStoragePath(file_path)) return null;
  return {
    id,
    title,
    category: cat,
    file_path,
    file_size,
    uploaded_by,
    created_at,
  };
}

export async function GET() {
  const auth = await requireTeamMember();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error." },
      { status: 500 },
    );
  }

  const { data, error } = await admin
    .from("reference_documents")
    .select(
      "id,title,category,file_path,file_size,uploaded_by,created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "42P01" ? 503 : 500 },
    );
  }

  const documents = (data ?? [])
    .map((r) => mapRow(r as Record<string, unknown>))
    .filter((x): x is ReferenceDocumentRow => x != null);

  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const adminAuth = await requireReferenceAdmin();
  if (!adminAuth) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const title = String(form.get("title") ?? "").trim();
  const category = String(form.get("category") ?? "").trim();
  const file = form.get("file");

  if (!title || title.length > 500) {
    return NextResponse.json({ error: "Title required (max 500 chars)." }, { status: 400 });
  }
  if (!isReferenceDocCategory(category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "PDF file required." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 50 MB)." },
      { status: 400 },
    );
  }
  const name = file.name || "document.pdf";
  if (!/\.pdf$/i.test(name)) {
    return NextResponse.json({ error: "Only PDF files are allowed." }, { status: 400 });
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  if (!isPdfMagic(buf)) {
    return NextResponse.json({ error: "File is not a valid PDF." }, { status: 400 });
  }

  const objectPath = buildReferenceDocObjectPath(name);
  if (!isSafeReferenceStoragePath(objectPath)) {
    return NextResponse.json({ error: "Invalid path." }, { status: 500 });
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

  const { error: upErr } = await supabase.storage
    .from(REFERENCE_DOCS_BUCKET)
    .upload(objectPath, buf, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (upErr) {
    return NextResponse.json(
      { error: upErr.message ?? "Upload failed." },
      { status: 502 },
    );
  }

  const { data: row, error: insErr } = await supabase
    .from("reference_documents")
    .insert({
      title,
      category,
      file_path: objectPath,
      file_size: file.size,
      uploaded_by: adminAuth.userId,
    })
    .select(
      "id,title,category,file_path,file_size,uploaded_by,created_at",
    )
    .maybeSingle();

  if (insErr || !row) {
    await supabase.storage.from(REFERENCE_DOCS_BUCKET).remove([objectPath]);
    return NextResponse.json(
      { error: insErr?.message ?? "Could not save document record." },
      { status: 500 },
    );
  }

  const doc = mapRow(row as Record<string, unknown>);
  if (!doc) {
    return NextResponse.json({ error: "Invalid row after insert." }, { status: 500 });
  }

  return NextResponse.json({ document: doc });
}
