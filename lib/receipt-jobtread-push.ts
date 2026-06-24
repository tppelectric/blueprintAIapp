import { fetchJobtreadJobById } from "@/lib/jobtread-client";
import { formatReceiptCurrency } from "@/lib/receipts-types";
import type { ReceiptRow } from "@/lib/receipts-types";

export type ReceiptPushJobRow = {
  id: string;
  job_name: string | null;
  job_number: string | null;
  jobtread_id: string | null;
  status: string | null;
  address: string | null;
  location_name?: string | null;
  customer_id: string | null;
  customers?: { company_name: string | null; contact_name: string | null } | null;
};

export type JobtreadJobLive = {
  id: string;
  name: string;
  number: string | null;
  status: string | null;
  customerName: string | null;
  address: string | null;
};

function formatReceiptDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function customerLabel(job: ReceiptPushJobRow): string {
  const c = job.customers;
  if (!c) return "—";
  return c.company_name?.trim() || c.contact_name?.trim() || "—";
}

function isClosedLocalStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "complete" || s === "completed" || s === "closed";
}

function isClosedJobtreadStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "closed";
}

/** Plain-text note posted to JobTread via createComment. */
/** JobTread comment message length cap (leave headroom under the API limit). */
const NOTE_MAX_CHARS = 3800;
/** Most line items to itemize in the note (the photo carries full detail). */
const NOTE_MAX_LINE_ITEMS = 40;

export function buildReceiptJobtreadNote(
  receipt: Pick<
    ReceiptRow,
    | "vendor_name"
    | "total_amount"
    | "receipt_date"
    | "receipt_category"
    | "description"
    | "line_items"
  >,
  job: Pick<ReceiptPushJobRow, "job_number" | "job_name">,
): string {
  const lines = [
    "Blueprint AI — Receipt",
    `Job: ${job.job_number?.trim() || "—"} - ${job.job_name?.trim() || "—"}`,
    `Vendor: ${receipt.vendor_name?.trim() || "—"}`,
    `Amount: ${formatReceiptCurrency(receipt.total_amount)}`,
    `Date: ${formatReceiptDate(receipt.receipt_date)}`,
    `Category: ${receipt.receipt_category?.trim() || "—"}`,
    `Description: ${receipt.description?.trim() || "—"}`,
  ];

  const items = Array.isArray(receipt.line_items) ? receipt.line_items : [];
  if (items.length) {
    lines.push("", `Line items (${items.length}):`);
    for (const it of items.slice(0, NOTE_MAX_LINE_ITEMS)) {
      const qty =
        it.quantity != null && Number.isFinite(Number(it.quantity))
          ? `${it.quantity}x `
          : "";
      const desc = (it.description ?? "").trim() || "—";
      const amt =
        it.total != null
          ? formatReceiptCurrency(it.total)
          : it.unit_price != null
            ? formatReceiptCurrency(it.unit_price)
            : "";
      lines.push(`- ${qty}${desc}${amt ? ` — ${amt}` : ""}`);
    }
    if (items.length > NOTE_MAX_LINE_ITEMS) {
      lines.push(`…and ${items.length - NOTE_MAX_LINE_ITEMS} more (see photo)`);
    }
  }

  let note = lines.join("\n");
  if (note.length > NOTE_MAX_CHARS) {
    note = `${note.slice(0, NOTE_MAX_CHARS - 1)}…`;
  }
  return note;
}

export function getReceiptPushBlockReason(args: {
  receipt: Pick<ReceiptRow, "job_id" | "pushed_to_jobtread_at">;
  job: ReceiptPushJobRow | null;
  grantKeyConfigured: boolean;
  jobtreadLive?: JobtreadJobLive | null;
  liveFetchError?: string | null;
}): string | null {
  if (!args.grantKeyConfigured) {
    return "JobTread is not configured (missing grant key).";
  }
  if (!args.receipt.job_id) {
    return "Receipt is not assigned to a job.";
  }
  if (!args.job) {
    return "Linked job could not be found.";
  }
  if (!args.job.jobtread_id?.trim()) {
    return "Job is not linked to JobTread (missing jobtread_id). Run a jobs sync first.";
  }
  if (isClosedLocalStatus(args.job.status)) {
    return "Job is closed in Blueprint AI — push is blocked.";
  }
  if (args.liveFetchError) {
    return `Could not verify job in JobTread: ${args.liveFetchError}`;
  }
  if (args.jobtreadLive && isClosedJobtreadStatus(args.jobtreadLive.status)) {
    return "Job is closed in JobTread — push is blocked.";
  }
  if (args.receipt.pushed_to_jobtread_at) {
    return "This receipt was already pushed to JobTread.";
  }
  return null;
}

export async function fetchJobtreadJobLive(
  grantKey: string,
  jobtreadJobId: string,
): Promise<{ live: JobtreadJobLive | null; error: string | null }> {
  try {
    const j = await fetchJobtreadJobById(grantKey, jobtreadJobId);
    if (!j) {
      return { live: null, error: "Job not found in JobTread." };
    }
    const address =
      j.location?.address?.trim() ||
      [j.location?.name?.trim()].filter(Boolean).join(", ") ||
      null;
    return {
      live: {
        id: j.id,
        name: j.name,
        number: j.number,
        status: j.status ?? null,
        customerName: j.account?.name ?? null,
        address,
      },
      error: null,
    };
  } catch (e) {
    return {
      live: null,
      error: e instanceof Error ? e.message : "JobTread lookup failed.",
    };
  }
}

export function jobLiveDisplayTitle(live: JobtreadJobLive): string {
  const n = live.number?.trim();
  const name = live.name?.trim();
  if (n && name) return `${n} - ${name}`;
  return n || name || live.id;
}

export { customerLabel, formatReceiptDate };
