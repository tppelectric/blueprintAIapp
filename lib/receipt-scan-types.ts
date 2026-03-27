import {
  RECEIPT_CATEGORIES,
  type ReceiptCategory,
  type ReceiptLineItem,
} from "@/lib/receipts-types";
import {
  extractJsonObjectFromModelText,
  sliceBalancedJsonObject,
} from "@/lib/project-describer-types";

export type ScanReceiptResult = {
  vendor_name: string;
  receipt_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  payment_method: string;
  card_last_four: string | null;
  card_type: string | null;
  receipt_category: ReceiptCategory;
  line_items: ReceiptLineItem[];
  confidence: number;
};

function asNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = parseFloat(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asNullableStr(v: unknown): string | null {
  const s = asStr(v).trim();
  return s ? s : null;
}

function normalizeCategory(v: unknown): ReceiptCategory {
  const s = asStr(v).trim();
  if ((RECEIPT_CATEGORIES as readonly string[]).includes(s)) {
    return s as ReceiptCategory;
  }
  const lower = s.toLowerCase();
  if (lower.includes("gas") || lower.includes("fuel")) return "Gas/Fuel";
  if (lower.includes("material") || lower.includes("supply")) return "Materials";
  if (lower.includes("tool")) return "Tools";
  if (lower.includes("meal") || lower.includes("food")) return "Meals";
  if (lower.includes("office")) return "Office";
  return "Other";
}

function asLineItems(v: unknown): ReceiptLineItem[] {
  if (!Array.isArray(v)) return [];
  const out: ReceiptLineItem[] = [];
  for (const row of v) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const description = asStr(o.description ?? o.item ?? o.name).trim();
    if (!description) continue;
    const qtyRaw = o.quantity ?? o.qty;
    const qty =
      qtyRaw == null || qtyRaw === ""
        ? null
        : Number.isFinite(Number(qtyRaw))
          ? Number(qtyRaw)
          : null;
    const upRaw = o.unit_price ?? o.price_each;
    const unit_price =
      upRaw == null || upRaw === ""
        ? null
        : Number.isFinite(Number(upRaw))
          ? Number(upRaw)
          : null;
    out.push({
      description,
      quantity: qty,
      unit_price,
      total: asNum(o.total ?? o.line_total ?? o.amount),
    });
  }
  return out;
}

export function normalizeScanReceiptJson(raw: unknown): ScanReceiptResult {
  const empty: ScanReceiptResult = {
    vendor_name: "",
    receipt_date: "",
    subtotal: 0,
    tax_amount: 0,
    total_amount: 0,
    payment_method: "",
    card_last_four: null,
    card_type: null,
    receipt_category: "Other",
    line_items: [],
    confidence: 0,
  };
  if (!raw || typeof raw !== "object") return empty;
  const o = raw as Record<string, unknown>;
  const total = asNum(o.total_amount ?? o.total);
  const sub = asNum(o.subtotal);
  const tax = asNum(o.tax_amount ?? o.tax);
  return {
    vendor_name: asStr(o.vendor_name ?? o.merchant ?? o.store).trim(),
    receipt_date: asStr(o.receipt_date ?? o.date ?? o.transaction_date).trim(),
    subtotal: sub || (total && tax ? Math.max(0, total - tax) : 0),
    tax_amount: tax,
    total_amount: total || sub + tax,
    payment_method: asStr(o.payment_method ?? o.payment_type).trim(),
    card_last_four: asNullableStr(o.card_last_four ?? o.last_four),
    card_type: asNullableStr(o.card_type ?? o.card_brand),
    receipt_category: normalizeCategory(
      o.receipt_category ?? o.category ?? o.expense_category,
    ),
    line_items: asLineItems(o.line_items ?? o.items),
    confidence: (() => {
      let c = asNum(o.confidence);
      if (c > 1) c = c / 100;
      return Math.min(1, Math.max(0, c));
    })(),
  };
}

export function extractReceiptJsonString(rawText: string): string | null {
  const body = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
  const ext = extractJsonObjectFromModelText(body);
  if (ext) return ext;
  const idx = body.search(/\{\s*"vendor_name"\s*:/);
  if (idx !== -1) {
    const slice = sliceBalancedJsonObject(body, idx);
    if (slice) return slice;
  }
  const first = body.indexOf("{");
  if (first !== -1) {
    const slice = sliceBalancedJsonObject(body, first);
    if (slice) return slice;
  }
  return null;
}
