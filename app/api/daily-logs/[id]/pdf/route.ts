import { NextResponse } from "next/server";
import { buildDailyLogPdf } from "@/lib/daily-log-pdf";
import type { DailyLogPhotoAttachment } from "@/lib/daily-log-pdf";
import { dailyLogPdfObjectPath } from "@/lib/daily-log-pdf-path";
import type { DailyLogRow } from "@/lib/daily-logs-types";
import { isUuid } from "@/lib/is-uuid";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid log id." }, { status: 400 });
  }

  try {
  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "1";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: row, error } = await supabase
    .from("daily_logs")
    .select("id, pdf_storage_path, log_date")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Log not found." }, { status: 404 });
  }

  const path = row.pdf_storage_path as string | null;
  if (!path?.trim()) {
    return NextResponse.json({ error: "No PDF saved for this log yet." }, { status: 404 });
  }

  const admin = createServiceRoleClient();
  const fname = `daily-log-${String(row.log_date).slice(0, 10)}.pdf`;
  const { data: signed, error: signErr } = await admin.storage
    .from("daily-log-pdfs")
    .createSignedUrl(path.trim(), 3600, download ? { download: fname } : undefined);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signErr?.message ?? "Could not create download link." },
      { status: 500 },
    );
  }

  return NextResponse.redirect(signed.signedUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid log id." }, { status: 400 });
  }

  try {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: log, error } = await supabase
    .from("daily_logs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !log) {
    return NextResponse.json({ error: "Log not found." }, { status: 404 });
  }

  const row = log as DailyLogRow;
  const admin = createServiceRoleClient();

  const { data: atts, error: attErr } = await admin
    .from("daily_log_attachments")
    .select("file_path, kind, caption, original_name, mime_type")
    .eq("daily_log_id", id)
    .eq("kind", "photo");

  if (attErr) {
    return NextResponse.json(
      { error: attErr.message ?? "Could not load attachments." },
      { status: 500 },
    );
  }

  const photos: DailyLogPhotoAttachment[] = (atts ?? []).map((a) => ({
    file_path: a.file_path as string,
    caption: (a.caption as string | null) ?? null,
    original_name: a.original_name as string,
    mime_type: a.mime_type as string,
  }));

  const downloadPhoto = async (storagePath: string) => {
    const { data, error: de } = await admin.storage
      .from("daily-log-attachments")
      .download(storagePath);
    if (de || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  };

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildDailyLogPdf(row, photos, downloadPhoto);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PDF build failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const objectPath = dailyLogPdfObjectPath(row);
  const { error: upErr } = await admin.storage
    .from("daily-log-pdfs")
    .upload(objectPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (upErr) {
    return NextResponse.json(
      { error: upErr.message ?? "Upload failed." },
      { status: 500 },
    );
  }

  const { error: uErr } = await admin
    .from("daily_logs")
    .update({ pdf_storage_path: objectPath })
    .eq("id", id);

  if (uErr) {
    return NextResponse.json(
      { error: uErr.message ?? "Could not save PDF path." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, path: objectPath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
