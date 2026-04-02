import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/api/withAuth";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  isSafeStoragePath,
  normalizeBlueprintStoragePath,
} from "@/lib/storage-path";

const BUCKET = "blueprints";
/** Signed URL TTL (seconds). Client refreshes before expiry. */
const EXPIRES_IN = 60 * 60;

export const POST = withAuth(async (request: NextRequest, _ctx) => {
  let body: { filePath?: string; fileUrl?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const raw = (body.filePath ?? body.fileUrl ?? "").trim();
  if (!raw) {
    return NextResponse.json(
      { error: "filePath or fileUrl is required." },
      { status: 400 },
    );
  }

  const path = normalizeBlueprintStoragePath(raw);
  if (!path || !isSafeStoragePath(path)) {
    return NextResponse.json({ error: "Invalid storage path." }, { status: 400 });
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

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, EXPIRES_IN);

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Could not create signed URL." },
      { status: 502 },
    );
  }

  if (!data?.signedUrl) {
    return NextResponse.json(
      { error: "No signed URL returned." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    expiresIn: EXPIRES_IN,
    path,
  });
});
