import type { AIPageContext } from "@/lib/ai-assistant-context";
import {
  basePromptAfterContext,
  basePromptFooter,
  basePromptIntro,
  requestWorkflowLine,
} from "@/lib/ai/prompts/basePrompt";
import { materialPrompt } from "@/lib/ai/prompts/materialPrompt";
import { proposalPrompt } from "@/lib/ai/prompts/proposalPrompt";

function entityLine(ctx: AIPageContext): string {
  if (ctx.entityType && ctx.entityId) {
    return `Focused entity: ${ctx.entityType} (${ctx.entityId})`;
  }
  if (ctx.entityType) {
    return `Focused entity type: ${ctx.entityType}`;
  }
  return "";
}

/**
 * Live context block (page, role, optional entity) — same shape as the former inline prompt.
 */
export function formatContextSnapshot(ctx: AIPageContext): string {
  const userRole = ctx.userRole?.trim() || "unknown";
  const entityContext = entityLine(ctx);
  return `Current page context: ${ctx.page} - ${ctx.pageTitle}
User role: ${userRole}
${entityContext ? `${entityContext}\n` : ""}`;
}

/**
 * Full system prompt: base modules + context snapshot + workflow lines + footer.
 * The caller must send `userMessage` as the latest user turn in the chat API (not duplicated here).
 */
export function buildPrompt(ctx: AIPageContext, _userMessage?: string): string {
  const snapshot = formatContextSnapshot(ctx);
  const workflowLine = `${materialPrompt} ${proposalPrompt} ${requestWorkflowLine}`;
  return `${basePromptIntro}${snapshot}
${basePromptAfterContext}
${workflowLine}

${basePromptFooter}`;
}
