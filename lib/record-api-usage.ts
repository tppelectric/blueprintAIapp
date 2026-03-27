import type Anthropic from "@anthropic-ai/sdk";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { ScanModeId } from "@/lib/scan-modes";

/** USD per million tokens — Claude Sonnet 4.x class; override with env for billing accuracy. */
const INPUT_PER_MTOK =
  Number(process.env.ANTHROPIC_PRICE_INPUT_PER_MTOK ?? "") || 3;
const OUTPUT_PER_MTOK =
  Number(process.env.ANTHROPIC_PRICE_OUTPUT_PER_MTOK ?? "") || 15;

export function calculateClaudeSonnetCostUsd(
  inputTokens: number,
  outputTokens: number,
): number {
  const i = Math.max(0, inputTokens);
  const o = Math.max(0, outputTokens);
  const usd =
    (i / 1_000_000) * INPUT_PER_MTOK + (o / 1_000_000) * OUTPUT_PER_MTOK;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export function anthropicUsageFromMessage(
  msg: Anthropic.Messages.Message | null | undefined,
): { inputTokens: number; outputTokens: number } {
  const u = msg?.usage;
  return {
    inputTokens: Math.max(0, Number(u?.input_tokens ?? 0)),
    outputTokens: Math.max(0, Number(u?.output_tokens ?? 0)),
  };
}

export type RecordApiUsageParams = {
  route: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** If set, used as Claude portion instead of token-based estimate. */
  costUsd?: number;
  /** Added to total_cost / openai_cost (e.g. standard-scan GPT line item). */
  openaiCostUsd?: number;
  userId?: string | null;
  projectId?: string | null;
  pageNumber?: number | null;
  /**
   * For blueprint analyze-page rows: store real scan mode in scan_type.
   * Otherwise scan_type is stored as `ai_route`.
   */
  blueprintScanType?: ScanModeId;
};

/**
 * Inserts one api_usage row (service role). Safe to call fire-and-forget;
 * logs in development on failure.
 */
export async function recordApiUsage(
  params: RecordApiUsageParams,
): Promise<void> {
  const inputTokens = Math.max(0, Math.floor(params.inputTokens));
  const outputTokens = Math.max(0, Math.floor(params.outputTokens));
  const claudeUsd =
    params.costUsd ??
    calculateClaudeSonnetCostUsd(inputTokens, outputTokens);
  const openaiUsd = Math.max(0, Number(params.openaiCostUsd ?? 0));
  const totalUsd =
    Math.round((claudeUsd + openaiUsd) * 1_000_000) / 1_000_000;

  const scanType: string =
    params.route === "analyze-page" && params.blueprintScanType
      ? params.blueprintScanType
      : "ai_route";

  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("api_usage").insert({
      project_id: params.projectId ?? null,
      page_number:
        params.pageNumber != null ? Math.floor(params.pageNumber) : null,
      scan_type: scanType,
      api_route: params.route,
      model: params.model,
      input_tokens: inputTokens || null,
      output_tokens: outputTokens || null,
      claude_cost: claudeUsd,
      openai_cost: openaiUsd,
      total_cost: totalUsd,
      pages_analyzed: 1,
      user_id: params.userId ?? null,
    });
    if (error && process.env.NODE_ENV === "development") {
      console.error("[recordApiUsage]", error.message, error.code, params.route);
    }
  } catch (e) {
    console.error("[recordApiUsage]", e);
  }
}
