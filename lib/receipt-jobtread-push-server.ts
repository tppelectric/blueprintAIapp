import { getStoredJobtreadApiKey } from "@/lib/jobtread-server-store";
import {
  buildReceiptJobtreadNote,
  fetchJobtreadJobLive,
  getReceiptPushBlockReason,
  type ReceiptPushJobRow,
} from "@/lib/receipt-jobtread-push";
import { parseReceiptRow } from "@/lib/receipts-parse";
import type { ReceiptRow } from "@/lib/receipts-types";
import type { createServiceRoleClient } from "@/lib/supabase/service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isReceiptId(id: string): boolean {
  return UUID_RE.test(id);
}

export async function loadReceiptPushContext(
  admin: ReturnType<typeof createServiceRoleClient>,
  receiptId: string,
): Promise<{
  receipt: ReceiptRow;
  job: ReceiptPushJobRow | null;
  notePreview: string;
  blockReason: string | null;
  jobLive: Awaited<ReturnType<typeof fetchJobtreadJobLive>>["live"];
}> {
  const { data: raw, error: recErr } = await admin
    .from("receipts")
    .select("*")
    .eq("id", receiptId)
    .maybeSingle();

  if (recErr) throw new Error(recErr.message);
  if (!raw) throw new Error("Receipt not found.");

  const receipt = parseReceiptRow(raw as Record<string, unknown>);

  let job: ReceiptPushJobRow | null = null;
  if (receipt.job_id) {
    const { data: jobRow, error: jobErr } = await admin
      .from("jobs")
      .select(
        "id,job_name,job_number,jobtread_id,status,address,location_name,customer_id,customers(company_name,contact_name)",
      )
      .eq("id", receipt.job_id)
      .maybeSingle();
    if (jobErr) throw new Error(jobErr.message);
    if (jobRow) {
      const row = jobRow as Record<string, unknown>;
      const custRaw = row.customers;
      const c = Array.isArray(custRaw) ? custRaw[0] : custRaw;
      job = {
        id: String(row.id),
        job_name: row.job_name != null ? String(row.job_name) : null,
        job_number: row.job_number != null ? String(row.job_number) : null,
        jobtread_id: row.jobtread_id != null ? String(row.jobtread_id) : null,
        status: row.status != null ? String(row.status) : null,
        address: row.address != null ? String(row.address) : null,
        location_name:
          row.location_name != null ? String(row.location_name) : null,
        customer_id: row.customer_id != null ? String(row.customer_id) : null,
        customers: c as ReceiptPushJobRow["customers"],
      };
    }
  }

  let grantKey: string | null = null;
  try {
    grantKey = await getStoredJobtreadApiKey();
  } catch {
    grantKey = null;
  }

  let jobLive: Awaited<ReturnType<typeof fetchJobtreadJobLive>>["live"] = null;
  let liveFetchError: string | null = null;

  if (grantKey && job?.jobtread_id?.trim()) {
    const liveRes = await fetchJobtreadJobLive(grantKey, job.jobtread_id);
    jobLive = liveRes.live;
    liveFetchError = liveRes.error;
  }

  const notePreview = job
    ? buildReceiptJobtreadNote(receipt, job)
    : buildReceiptJobtreadNote(receipt, {
        job_number: null,
        job_name: null,
      });

  const blockReason = getReceiptPushBlockReason({
    receipt,
    job,
    grantKeyConfigured: Boolean(grantKey),
    jobtreadLive: jobLive,
    liveFetchError,
  });

  return {
    receipt,
    job,
    notePreview,
    blockReason,
    jobLive,
  };
}
