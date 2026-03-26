import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { buildBlueprintUploadObjectPath } from "@/lib/storage-path";

/** Fallback / tooling uploads; primary path is browser → Supabase (`lib/upload-blueprint.ts`). */
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "blueprints";
/** Align with reference library uploads (50 MiB). */
const MAX_UPLOAD_BYTES = 52_428_800;

export async function POST(request: Request) {
  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Supabase not configured." },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field." }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: "Empty file." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).` },
      { status: 413 },
    );
  }

  const type = file.type;
  if (
    type &&
    type !== "application/pdf" &&
    type !== "application/octet-stream" &&
    type !== "application/x-pdf"
  ) {
    return NextResponse.json(
      { error: "Only PDF uploads are allowed." },
      { status: 400 },
    );
  }

  // Always `uploads/<uuid>-<slug>.pdf` — no spaces/special chars; private bucket path only.
  const objectPath = buildBlueprintUploadObjectPath(file.name);
  const buf = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, buf, {
    contentType: "application/pdf",
    upsert: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    storagePath: objectPath,
    fileSize: file.size,
    originalFileName: file.name,
  });
}
