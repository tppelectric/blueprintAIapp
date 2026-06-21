import { NextResponse, type NextRequest } from "next/server";
import { createJobtreadJobComment } from "@/lib/jobtread-write";
import { getStoredJobtreadApiKey } from "@/lib/jobtread-server-store";
import {
  isReceiptId,
  loadReceiptPushContext,
} from "@/lib/receipt-jobtread-push-server";
import { requireReceiptJobtreadPushFromRequest } from "@/lib/require-receipt-jobtread-push";

export const dynamic = "force-dynamic";

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
          updErr: updErr.message,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok: true,
      commentId,
      message,
      pushedAt,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Push failed." },
      { status: 500 },
    );
  }
}
