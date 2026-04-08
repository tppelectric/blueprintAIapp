/**
 * Pipeline tiles aggregate `jobs.need_ready_to_invoice` into buckets.
 * Overrides live in `pipeline_bucket_overrides` (see status-counts API).
 */

export type PipelineCountBucket =
  | "ready_to_invoice"
  | "in_progress"
  | "invoiced"
  | "paid"
  | "on_hold"
  | "needs_update";

/** Default grouping: add new raw values here instead of rewriting counter logic. */
export const BUCKET_MAP: Record<
  Exclude<PipelineCountBucket, "needs_update">,
  readonly string[]
> = {
  ready_to_invoice: ["YES, READY TO BE INVOICED"],
  in_progress: [
    "NEW JOB/JUST STARTED",
    "NO, JOB STILL IN PROGRESS",
    "IN PROGRESS",
    "ESTIMATING",
  ],
  invoiced: [
    "INVOICED/SENT",
    "PARTIAL/PROGRESS PAYMENT RECEIVED",
    "DOCUMENT MADE/NEEDS REVIEW BEFORE SENDING",
  ],
  paid: ["PAID", "BARTERED WORK"],
  on_hold: [
    "ON HOLD/WAITING FOR MATERIAL",
    "ON HOLD/WAITING FOR APPROVAL",
  ],
};

export const PIPELINE_BUCKET_OPTIONS: {
  id: PipelineCountBucket;
  label: string;
}[] = [
  { id: "ready_to_invoice", label: "Ready to invoice" },
  { id: "in_progress", label: "In progress" },
  { id: "invoiced", label: "Invoiced" },
  { id: "paid", label: "Paid" },
  { id: "on_hold", label: "On hold" },
  { id: "needs_update", label: "Needs update" },
];

export function normalizeInvoiceStatus(v: string): string {
  return v.trim().toUpperCase();
}

export function bucketForValue(
  raw: string | null | undefined,
  overrideNormToBucket: Map<string, PipelineCountBucket>,
): PipelineCountBucket {
  if (raw == null || !String(raw).trim()) return "needs_update";
  const norm = normalizeInvoiceStatus(raw);
  const fromOverride = overrideNormToBucket.get(norm);
  if (fromOverride) return fromOverride;
  for (const [bucket, labels] of Object.entries(BUCKET_MAP) as [
    Exclude<PipelineCountBucket, "needs_update">,
    readonly string[],
  ][]) {
    if (labels.some((l) => normalizeInvoiceStatus(l) === norm)) {
      return bucket;
    }
  }
  return "needs_update";
}
