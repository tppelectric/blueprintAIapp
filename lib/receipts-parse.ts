import type { ReceiptLineItem, ReceiptRow } from "@/lib/receipts-types";

export function parseReceiptRow(r: Record<string, unknown>): ReceiptRow {
  let line_items: ReceiptLineItem[] = [];
  const li = r.line_items;
  if (Array.isArray(li)) line_items = li as ReceiptLineItem[];
  else if (typeof li === "string") {
    try {
      line_items = JSON.parse(li) as ReceiptLineItem[];
    } catch {
      line_items = [];
    }
  }
  return {
    id: String(r.id),
    created_at: String(r.created_at),
    uploaded_by: String(r.uploaded_by),
    job_id: r.job_id ? String(r.job_id) : null,
    daily_log_id: r.daily_log_id ? String(r.daily_log_id) : null,
    storage_path: String(r.storage_path),
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
    confidence:
      r.confidence != null && r.confidence !== ""
        ? Number(r.confidence)
        : null,
    notes: r.notes != null ? String(r.notes) : null,
  };
}
