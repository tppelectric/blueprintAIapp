/** Maps api_usage rows to dashboard breakdown buckets (by api_route + legacy scan_type). */

export type UsageCostBreakdown = {
  blueprintScanning: number;
  receiptScanning: number;
  dailyLogAi: number;
  projectAnalysis: number;
  necChecker: number;
  otherAi: number;
};

export type UsageBreakdownKey = keyof UsageCostBreakdown;

const BLUEPRINT_ROUTES = new Set([
  "analyze-page",
  "analyze-rooms-page",
  "detect-legend",
  "analyze-target",
]);

const RECEIPT_ROUTES = new Set(["scan-receipt"]);
const DAILY_LOG_ROUTES = new Set(["process-daily-log"]);
const PROJECT_ROUTES = new Set([
  "analyze-project-description",
  "scan-floor-plan-rooms",
  "generate-project-package",
]);

const NEC_ROUTES = new Set(["nec-question"]);

export function emptyUsageCostBreakdown(): UsageCostBreakdown {
  return {
    blueprintScanning: 0,
    receiptScanning: 0,
    dailyLogAi: 0,
    projectAnalysis: 0,
    necChecker: 0,
    otherAi: 0,
  };
}

/** Labels for cost breakdown UI (order matches typical report flow). */
export const USAGE_BREAKDOWN_ROWS: ReadonlyArray<{
  key: UsageBreakdownKey;
  label: string;
}> = [
  { key: "blueprintScanning", label: "Blueprint scanning" },
  { key: "receiptScanning", label: "Receipt scanning" },
  { key: "dailyLogAi", label: "Daily log AI" },
  { key: "projectAnalysis", label: "Project analysis" },
  { key: "otherAi", label: "Other AI" },
];

export function categoryForUsageRow(row: {
  api_route: string | null;
  scan_type: string | null;
}): UsageBreakdownKey {
  const route = (row.api_route ?? "").trim();
  if (BLUEPRINT_ROUTES.has(route)) return "blueprintScanning";
  if (RECEIPT_ROUTES.has(route)) return "receiptScanning";
  if (DAILY_LOG_ROUTES.has(route)) return "dailyLogAi";
  if (PROJECT_ROUTES.has(route)) return "projectAnalysis";
  if (NEC_ROUTES.has(route)) return "necChecker";
  if (route) return "otherAi";
  const st = (row.scan_type ?? "").trim();
  if (["quick", "standard", "deep", "manual"].includes(st)) {
    return "blueprintScanning";
  }
  return "otherAi";
}
