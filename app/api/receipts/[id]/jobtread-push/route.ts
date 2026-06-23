import { NextResponse, type NextRequest } from "next/server";
import {
  createJobtreadJobComment,
  createJobtreadJobFile,
} from "@/lib/jobtread-write";
import {
  fetchJobtreadRow,
  getStoredJobtreadApiKey,
} from "@/lib/jobtread-server-store";
import {
  isReceiptId,
  loadReceiptPushContext,
} from "@/lib/receipt-jobtread-push-server";
import { requireReceiptJobtreadPushFromRequest } from "@/lib/require-receipt-jobtread-push";

export const dynamic = "force-dynamic";

const RECEIPTS_BUCKET = "job-receipts";

/** Infer an image MIME type from a storage path extension. */
function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  if (ext === "heic") return "image/heic";
  return "image/jpeg";
}

/** Build a friendly file name for the JobTread attachment. */
function attachmentName(
  storagePath: string,
  jobNumber: string | null,
  vendor: string | null,
): string {
  const ext = storagePath.split(".").pop()?.toLowerCase() || "jpg";
  const parts = ["Receipt"];
  if (jobNumber?.trim()) parts.push(jobNumber.trim());
  if (vendor?.trim()) parts.push(vendor.trim().replace(/[\\/:*?"<>|]+/g, "-"));
  return `${parts.join(" - ").slice(0, 120)}.${ext}`;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: receiptId } = await context.params;
  const gate = await requireReceiptJobtreadPushFromRequest(request);
  if ("error" in gate) return gate.error;

  if (!isReceiptId(receiptId)) {
    return NextResponse.json({ error: "Invalid receipt id." }, { status: 400 });
  }

  let body: { confirm?: boolean } = {};
  try {
    body = (await request.json()) as { confirm?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "Explicit confirm required (confirm: true)." },
      { status: 400 },
    );
  }

  try {
    const ctx = await loadReceiptPushContext(gate.ok.admin, receiptId);
    if (ctx.blockReason) {
      return NextResponse.json({ error: ctx.blockReason }, { status: 400 });
    }
    if (!ctx.job?.jobtread_id?.trim()) {
      return NextResponse.json(
        { error: "Job is not linked to JobTread." },
        { status: 400 },
      );
    }

    const grantKey = await getStoredJobtreadApiKey();
    if (!grantKey) {
      return NextResponse.json(
        { error: "JobTread grant key is not configured." },
        { status: 503 },
      );
    }

    const { commentId, message } = await createJobtreadJobComment({
      grantKey,
      jobtreadJobId: ctx.job.jobtread_id,
      message: ctx.notePreview,
    });

    // Attach the receipt image to the same job (best-effort: a storage/upload
    // hiccup must not undo the note that already posted). Confirmed flow:
    // createUploadRequest -> PUT bytes -> createFile (see lib/jobtread-write.ts).
    let fileId: string | null = null;
    let imageWarning: string | null = null;
    try {
      const storagePath = ctx.receipt.storage_path?.trim();
      if (!storagePath) {
        imageWarning = "Receipt has no stored image to attach.";
      } else {
        const orgId = (await fetchJobtreadRow())?.company_id?.trim() ?? "";
        if (!orgId) {
          imageWarning = "JobTread organization id is not configured.";
        } else {
          const { data: blob, error: dlErr } = await gate.ok.admin.storage
            .from(RECEIPTS_BUCKET)
            .download(storagePath);
          if (dlErr || !blob) {
            imageWarning = `Could not read receipt image: ${dlErr?.message ?? "not found"}.`;
          } else {
            const res = await createJobtreadJobFile({
              grantKey,
              organizationId: orgId,
              jobtreadJobId: ctx.job.jobtread_id,
              fileName: attachmentName(
                storagePath,
                ctx.job.job_number,
                ctx.receipt.vendor_name,
              ),
              mimeType: mimeFromPath(storagePath),
              blob,
            });
            fileId = res.fileId;
          }
        }
      }
    } catch (e) {
      imageWarning =
        e instanceof Error
          ? `Image attach failed: ${e.message}`
          : "Image attach failed.";
    }

    const pushedAt = new Date().toISOString();
    const { error: updErr } = await gate.ok.admin
      .from("receipts")
      .update({
        pushed_to_jobtread_at: pushedAt,
        jobtread_comment_id: commentId,
      })
      .eq("id", receiptId);

    if (updErr) {
      return NextResponse.json(
        {
          ok: true,
          warning:
            "Comment posted to JobTread but local receipt row could not be updated. Run receipts_jobtread_push.sql if columns are missing.",
          commentId,
          message,
          fileId,
          imageWarning,
          updErr: updErr.message,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok: true,
      commentId,
      message,
      fileId,
      imageWarning,
      pushedAt,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Push failed." },
      { status: 500 },
    );
  }
}
