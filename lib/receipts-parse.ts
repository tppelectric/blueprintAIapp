import type { ReceiptLineItem, ReceiptRow } from "@/lib/receipts-types";

function parseLineItemsJson(raw: unknown): ReceiptLineItem[] {
  const li =
    raw !== undefined && raw !== null
      ? raw
      : undefined;
  if (li === undefined) return [];
  if (Array.isArray(li)) return li as ReceiptLineItem[];
  if (typeof li === "string") {
    try {
      return JSON.parse(li) as ReceiptLineItem[];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Normalize a `receipts` row from PostgREST into the app `ReceiptRow` shape.
 * Supports current DB columns (`file_path`, `line_items_json`, `employee_id`,
 * `ai_confidence`) and legacy names (`storage_path`, `line_items`, `uploaded_by`,
 * `confidence`).
 */
export function parseReceiptRow(r: Record<string, unknown>): ReceiptRow {
  const lineSource =
    r.line_items_json !== undefined && r.line_items_json !== null
      ? r.line_items_json
      : r.line_items;
  const line_items = parseLineItemsJson(lineSource);

  const uploadedBy = r.employee_id ?? r.uploaded_by;
  const storagePath = r.file_path ?? r.storage_path;

  const confRaw = r.ai_confidence ?? r.confidence;
  const confidence =
    confRaw != null && confRaw !== "" ? Number(confRaw) : null;

  return {
    id: String(r.id),
    created_at: String(r.created_at ?? ""),
    uploaded_by: uploadedBy != null ? String(uploadedBy) : "",
    job_id: r.job_id ? String(r.job_id) : null,
    daily_log_id: r.daily_log_id ? String(r.daily_log_id) : null,
    storage_path: storagePath != null ? String(storagePath) : "",
    vendor_name: r.vendor_name != null ? String(r.vendor_name) : null,
    receipt_date: r.receipt_date != null ? String(r.receipt_date) : null,
    subtotal:
      r.subtotal != null && r.subtotal !== ""
        ? Number(r.subtotal)
        : null,
    tax_amount:
      r.tax_amount != null && r.tax_amount !== ""
        ? Number(r.tax_amount)
        : null,
    total_amount: Number(r.total_amount ?? 0),
    payment_method:
      r.payment_method != null ? String(r.payment_method) : null,
    card_last_four:
      r.card_last_four != null ? String(r.card_last_four) : null,
    card_type: r.card_type != null ? String(r.card_type) : null,
    receipt_category: String(r.receipt_category ?? "Other"),
    line_items,
    confidence: Number.isFinite(confidence) ? confidence : null,
    notes: r.notes != null ? String(r.notes) : null,
  };
}
