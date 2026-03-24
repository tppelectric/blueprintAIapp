import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  type ScanModeId,
  scanModeById,
} from "@/lib/scan-modes";

const SCAN_TYPES = new Set<ScanModeId>(["quick", "standard", "deep", "manual"]);

/**
 * Inserts one api_usage row after a successful Claude analyze-page run.
 * Called from the analyze-page API so usage is recorded even if the client
 * disconnects before refreshing totals.
 */
export async function recordAnalyzePageApiUsage(params: {
  projectId: string;
  pageNumber: number;
  scanType: string | undefined;
  /** Number of Claude message turns (2 when a JSON-repair pass ran). */
  claudeTurns: number;
}): Promise<void> {
  const raw = params.scanType?.trim().toLowerCase();
  const st: ScanModeId = raw && SCAN_TYPES.has(raw as ScanModeId)
    ? (raw as ScanModeId)
    : "standard";
  const meta = scanModeById(st);
  const turns = Math.max(1, Math.min(4, Math.floor(params.claudeTurns)));
  const claudeCost = meta.claudeCostPerPage * turns;
  const openaiCost = meta.openaiCostPerPage;
  const totalCost = Math.round((claudeCost + openaiCost) * 100) / 100;

  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("api_usage").insert({
      project_id: params.projectId,
      page_number: params.pageNumber,
      scan_type: st,
      claude_cost: claudeCost,
      openai_cost: openaiCost,
      total_cost: totalCost,
      pages_analyzed: 1,
    });
    if (error && process.env.NODE_ENV === "development") {
      console.error("[recordAnalyzePageApiUsage]", error.message, error.code);
    }
  } catch (e) {
    console.error("[recordAnalyzePageApiUsage]", e);
  }
}
