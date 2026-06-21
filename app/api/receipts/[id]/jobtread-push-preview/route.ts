import { NextResponse, type NextRequest } from "next/server";
import {
  isReceiptId,
  loadReceiptPushContext,
} from "@/lib/receipt-jobtread-push-server";
import { jobLiveDisplayTitle } from "@/lib/receipt-jobtread-push";
import { requireReceiptJobtreadPushFromRequest } from "@/lib/require-receipt-jobtread-push";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: receiptId } = await context.params;
  const gate = await requireReceiptJobtreadPushFromRequest(request);
  if ("error" in gate) return gate.error;

  if (!isReceiptId(receiptId)) {
    return NextResponse.json({ error: "Invalid receipt id." }, { status: 400 });
  }

  try {
    const ctx = await loadReceiptPushContext(gate.ok.admin, receiptId);
    return NextResponse.json({
      ok: true,
      blockReason: ctx.blockReason,
      notePreview: ctx.notePreview,
      alreadyPushed: Boolean(ctx.receipt.pushed_to_jobtread_at),
      pushedAt: ctx.receipt.pushed_to_jobtread_at ?? null,
      jobLocal: ctx.job
        ? {
            id: ctx.job.id,
            jobNumber: ctx.job.job_number,
            jobName: ctx.job.job_name,
            jobtreadId: ctx.job.jobtread_id,
            status: ctx.job.status,
          }
        : null,
      jobLive: ctx.jobLive
        ? {
            id: ctx.jobLive.id,
            title: jobLiveDisplayTitle(ctx.jobLive),
            number: ctx.jobLive.number,
            name: ctx.jobLive.name,
            customerName: ctx.jobLive.customerName,
            address: ctx.jobLive.address,
            status: ctx.jobLive.status,
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Preview failed." },
      { status: 500 },
    );
  }
}
