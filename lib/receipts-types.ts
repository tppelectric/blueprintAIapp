/** Categories used for totals / dropdowns (align with AI prompt). */
export const RECEIPT_CATEGORIES = [
  "Materials",
  "Gas/Fuel",
  "Tools",
  "Meals",
  "Office",
  "Other",
] as const;

export type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number];

export type ReceiptLineItem = {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  total: number;
};

export type ReceiptRow = {
  id: string;
  created_at: string;
  uploaded_by: string;
  job_id: string | null;
  daily_log_id: string | null;
  storage_path: string;
  vendor_name: string | null;
  receipt_date: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number;
  payment_method: string | null;
  card_last_four: string | null;
  card_type: string | null;
  receipt_category: string;
  line_items: ReceiptLineItem[];
  confidence: number | null;
  notes: string | null;
  /** Optional user memo (DB column `description` when present). */
  description: string | null;
  scan_raw?: unknown;
};

export type ReceiptInsert = Omit<ReceiptRow, "created_at"> & {
  created_at?: string;
};

/** Map category to summary bucket on job report. */
export function receiptCategoryBucket(
  c: string | null | undefined,
): "Materials" | "Gas/Fuel" | "Tools" | "Other" {
  const x = (c ?? "").trim();
  if (x === "Materials") return "Materials";
  if (x === "Gas/Fuel") return "Gas/Fuel";
  if (x === "Tools") return "Tools";
  return "Other";
}

export function formatReceiptCurrency(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n));
}

export { userDisplayName as displayProfileName } from "@/lib/user-display-name";
