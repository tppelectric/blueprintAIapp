import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type {
  AIMessage,
  AIResponse,
  AIPageContext,
} from "@/lib/ai-assistant-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";

function entityLine(ctx: AIPageContext): string {
  if (ctx.entityType && ctx.entityId) {
    return `Focused entity: ${ctx.entityType} (${ctx.entityId})`;
  }
  if (ctx.entityType) {
    return `Focused entity type: ${ctx.entityType}`;
  }
  return "";
}

function buildSystemPrompt(ctx: AIPageContext): string {
  const entityContext = entityLine(ctx);
  const userRole = ctx.userRole?.trim() || "unknown";
  return `You are an AI assistant inside Blueprint AI, a business management platform for TPP Electrical Contractors Inc., a full-service electrical and low-voltage contracting company based in New York.

You help with:
- Job management and scheduling
- Electrical estimating and proposals
- Material takeoffs and ordering
- Field operations and daily logs
- Team management and time tracking
- Inventory and tool management
- License and certification tracking
- Vehicle fleet management
- NEC 2023 code questions (New York uses 2023 NEC)

Current page context: ${ctx.page} - ${ctx.pageTitle}
User role: ${userRole}
${entityContext ? `${entityContext}\n` : ""}
Rules:
- Always be concise and practical
- Suggest specific actions when possible
- Reference real app pages and features
- For NEC questions, always note NY jurisdiction uses 2023 NEC
- When suggesting navigation, use these paths:
  /jobs, /customers, /inventory, /inventory/tools, /inventory/vehicles,
  /receipts, /requests, /timesheets, /team-clock, /licenses, /field,
  /tools/wifi-analyzer, /tools/av-analyzer, /tools/electrical-analyzer,
  /tools/smarthome-analyzer, /tools/nec-checker, /tools/load-calculator,
  /tools/project-describer, /dashboard, /settings/integrations

Return JSON only in this exact shape:
{
  "message": "your response text here",
  "actions": [
    { "type": "navigate", "label": "Open Jobs", "href": "/jobs" },
    { "type": "navigate", "label": "NEC Checker", "href": "/tools/nec-checker" }
  ]
}

actions array is optional — only include when genuinely useful.
action types: navigate, create, info
Keep message under 200 words.`;
}

function toAnthropicHistory(
  history: AIMessage[],
): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of history) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = String(m.content ?? "").trim();
    if (!text) continue;
    out.push({ role: m.role, content: text });
  }
  return out;
}

function parseAssistantJson(raw: string): AIResponse {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  try {
    const j = JSON.parse(t) as unknown;
    if (!j || typeof j !== "object") {
      return { message: raw };
    }
    const o = j as Record<string, unknown>;
    const message =
      typeof o.message === "string" ? o.message : String(o.message ?? raw);
    const actionsRaw = o.actions;
    let actions: AIResponse["actions"];
    if (Array.isArray(actionsRaw)) {
      actions = actionsRaw
        .map((a) => {
          if (!a || typeof a !== "object") return null;
          const ar = a as Record<string, unknown>;
          const type = typeof ar.type === "string" ? ar.type : "";
          const label = typeof ar.label === "string" ? ar.label : "";
          if (!type || !label) return null;
          const href =
            typeof ar.href === "string" ? ar.href : undefined;
          const data =
            ar.data && typeof ar.data === "object" && !Array.isArray(ar.data)
              ? (ar.data as Record<string, unknown>)
              : undefined;
          return { type, label, href, data };
        })
        .filter(Boolean) as AIResponse["actions"];
      if (actions?.length === 0) actions = undefined;
    }
    return { message, actions };
  } catch {
    return { message: raw };
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Server is missing ANTHROPIC_API_KEY." },
        { status: 500 },
      );
    }

    let body: {
      message?: string;
      context?: AIPageContext;
      history?: AIMessage[];
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json(
        { ok: false, error: "message is required." },
        { status: 400 },
      );
    }
    if (message.length > 8000) {
      return NextResponse.json(
        { ok: false, error: "message too long." },
        { status: 400 },
      );
    }

    const context: AIPageContext =
      body.context && typeof body.context === "object"
        ? {
            page: String(body.context.page ?? "app"),
            pageTitle: String(body.context.pageTitle ?? "Blueprint AI"),
            entityType:
              body.context.entityType != null
                ? String(body.context.entityType)
                : undefined,
            entityId:
              body.context.entityId != null
                ? String(body.context.entityId)
                : undefined,
            userRole:
              body.context.userRole != null
                ? String(body.context.userRole)
                : undefined,
            metadata:
              body.context.metadata &&
              typeof body.context.metadata === "object" &&
              !Array.isArray(body.context.metadata)
                ? (body.context.metadata as Record<string, unknown>)
                : undefined,
          }
        : { page: "app", pageTitle: "Blueprint AI" };

    const history = Array.isArray(body.history) ? body.history : [];
    const historySlice = history.slice(-10);
    const anthropicMessages = [
      ...toAnthropicHistory(historySlice),
      { role: "user" as const, content: message },
    ];

    const anthropic = new Anthropic({ apiKey });
    const system = buildSystemPrompt(context);

    const claudeMsg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system,
      messages: anthropicMessages,
    });

    const rawText = claudeMsg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();

    const response = parseAssistantJson(rawText || "No response.");

    return NextResponse.json({ ok: true, response });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Assistant request failed.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
