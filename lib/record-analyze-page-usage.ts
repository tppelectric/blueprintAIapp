import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  type ScanModeId,
  scanModeById,
} from "@/lib/scan-modes";
import { recordApiUsage } from "@/lib/record-api-usage";

const SCAN_TYPES = new Set<ScanModeId>(["quick", "standard", "deep", "manual"]);

function scanTypeFromBody(raw: string | undefined): ScanModeId {
  const t = raw?.trim().toLowerCase();
  return t && SCAN_TYPES.has(t as ScanModeId) ? (t as ScanModeId) : "standard";
}

/**
 * Inserts one api_usage row after a successful Claude analyze-page run.
 * Prefers token-derived Claude cost when tokens are present; otherwise uses
 * legacy per-mode estimates (and OpenAI line item for standard/deep).
 */
export async function recordAnalyzePageApiUsage(params: {
  projectId: string;
  pageNumber: number;
  scanType: string | undefined;
  /** Number of Claude message turns (2 when a JSON-repair pass ran). */
  claudeTurns: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  userId?: string | null;
}): Promise<void> {
  const st = scanTypeFromBody(params.scanType);
  const meta = scanModeById(st);
  const tokenIn = Math.max(0, Math.floor(params.inputTokens ?? 0));
  const tokenOut = Math.max(0, Math.floor(params.outputTokens ?? 0));

  if (tokenIn + tokenOut > 0) {
    await recordApiUsage({
      route: "analyze-page",
      model: params.model ?? "claude-sonnet-4-6",
      inputTokens: tokenIn,
      outputTokens: tokenOut,
      openaiCostUsd: meta.openaiCostPerPage,
      userId: params.userId,
      projectId: params.projectId,
      pageNumber: params.pageNumber,
      blueprintScanType: st,
    });
    return;
  }

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
