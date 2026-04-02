import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import type {
  AIMessage,
  AIResponse,
  AIPageContext,
} from "@/lib/ai-assistant-context";
import { createSupabaseRouteClient } from "@/lib/supabase/server";

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

function buildSystemPrompt(ctx: AIPageContext, liveSnapshot: string): string {
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
- When suggesting navigation, use these paths (always start with /):
  /jobs, /jobs/daily-logs, /customers, /inventory, /inventory/tools, /inventory/vehicles,
  /receipts, /requests, /requests/new, /my-requests, /timesheets, /team-clock, /licenses, /field,
  /tools/wifi-analyzer, /tools/av-analyzer, /tools/electrical-analyzer,
  /tools/smarthome-analyzer, /tools/nec-checker, /tools/load-calculator,
  /tools/project-describer, /dashboard, /settings/integrations

Canonical action labels for common tasks (use navigate + href exactly as shown):
- Submit a request inline (never navigate): type "create_request", include data object with these fields:
  request_type (one of: material_order, tool_request, tool_repair, vehicle_maintenance,
  vehicle_request, document_request, license_request, expense_reimbursement,
  safety_incident, hr_admin, app_support, other),
  title (string, required),
  description (string or null),
  priority (one of: low, normal, urgent, emergency — default normal),
  item_description (string or null),
  job_id (UUID string or null — only if user mentioned a specific job)

  Example action:
  { "type": "create_request", "label": "Submit Material Request", "data": {
    "request_type": "material_order",
    "title": "Conduit and fittings for 584 Main St",
    "description": "Need 50ft 3/4 EMT conduit plus connectors",
    "priority": "normal",
    "item_description": "3/4 EMT conduit, connectors",
    "job_id": null
  }}
- Daily field logs list: label "Daily Logs", href "/jobs/daily-logs"
- Timesheets: label "View Timesheets", href "/timesheets"

Return JSON only in this exact shape — no other text, no markdown, no code blocks before or after:
{
  "message": "your natural language response here — NO JSON, NO code blocks inside this field",
  "actions": [
    { "type": "navigate", "label": "Open Jobs", "href": "/jobs" }
  ]
}
CRITICAL: The message value is plain conversational text only. Never paste JSON, action objects, or code blocks inside message. The entire API response is the JSON object — do not wrap it or repeat it inside the message string.

actions array is optional — only include when genuinely useful.
action types: navigate, create, info
Keep message under 200 words.

CRITICAL RULES — Live app snapshot:
- You MUST use the provided "Live app snapshot" (the JSON block below) to answer any question about: team members on site (who is clocked in), open requests, or active jobs.
- DO NOT tell the user to check another page or screen if the answer already exists in the snapshot.
- DO NOT give generic instructions when snapshot data is available for that question.
- ALWAYS prioritize snapshot data over general knowledge for those topics.
- If the snapshot contains data for what they asked → summarize it directly in your message.
- If the snapshot is empty for what they asked → say "No data available" (do not invent entries).

${liveSnapshot}`;
}

const COMMAND_CENTER_LIMIT = 10;

type CommandCenterSnapshot = {
  teamOnSite: Array<{
    displayName: string;
    jobName: string | null;
    punchInAt: string;
    onLunch: boolean;
  }>;
  openRequests: Array<{
    requestNumber: string;
    title: string;
    status: string;
    requestType: string;
    priority: string;
  }>;
  activeJobs: Array<{
    jobNumber: string;
    jobName: string;
    status: string;
    location: string;
  }>;
};

function formatCommandCenterSnapshot(s: CommandCenterSnapshot): string {
  return [
    "Live app snapshot (read-only; reflects this user's permissions).",
    "Use ONLY this for factual questions about clock-ins, requests, or jobs.",
    "If a list is empty, say no data is available for that category — do not invent entries.",
    "",
    JSON.stringify(s),
  ].join("\n");
}

async function loadCommandCenterSnapshot(
  supabase: ReturnType<typeof createSupabaseRouteClient>,
): Promise<CommandCenterSnapshot> {
  const empty: CommandCenterSnapshot = {
    teamOnSite: [],
    openRequests: [],
    activeJobs: [],
  };
  try {
    const [punchesRes, requestsRes, jobsRes] = await Promise.all([
      supabase
        .from("time_punches")
        .select("employee_id, job_name, punch_in_at, on_lunch")
        .is("punch_out_at", null)
        .order("punch_in_at", { ascending: false })
        .limit(COMMAND_CENTER_LIMIT),
      supabase
        .from("internal_requests")
        .select(
          "request_number, title, status, request_type, priority, created_at",
        )
        .not("status", "in", "(completed,declined,cancelled)")
        .order("created_at", { ascending: false })
        .limit(COMMAND_CENTER_LIMIT),
      supabase
        .from("jobs")
        .select("job_number, job_name, status, city, state")
        .eq("status", "Active")
        .order("updated_at", { ascending: false })
        .limit(COMMAND_CENTER_LIMIT),
    ]);

    const teamOnSite: CommandCenterSnapshot["teamOnSite"] = [];
    const ids = [
      ...new Set(
        (punchesRes.data ?? [])
          .map((r) => r.employee_id as string)
          .filter(Boolean),
      ),
    ];
    const nameById = new Map<string, string>();
    if (ids.length && !punchesRes.error) {
      const { data: profs } = await supabase
        .from("user_profiles")
        .select("id, full_name, first_name, last_name")
        .in("id", ids);
      for (const p of profs ?? []) {
        const fn = String((p as { full_name?: string }).full_name ?? "").trim();
        const a = String(
          (p as { first_name?: string }).first_name ?? "",
        ).trim();
        const b = String(
          (p as { last_name?: string }).last_name ?? "",
        ).trim();
        const label = fn || [a, b].filter(Boolean).join(" ") || "Team member";
        nameById.set(String((p as { id: string }).id), label);
      }
    }
    if (!punchesRes.error && punchesRes.data) {
      for (const r of punchesRes.data) {
        const eid = r.employee_id as string;
        teamOnSite.push({
          displayName: nameById.get(eid) ?? "Team member",
          jobName: (r.job_name as string | null) ?? null,
          punchInAt: String(r.punch_in_at ?? ""),
          onLunch: Boolean(r.on_lunch),
        });
      }
    }

    const openRequests: CommandCenterSnapshot["openRequests"] = [];
    if (!requestsRes.error && requestsRes.data) {
      for (const r of requestsRes.data) {
        openRequests.push({
          requestNumber: String(
            (r as { request_number?: string }).request_number ?? "",
          ),
          title: String((r as { title?: string }).title ?? ""),
          status: String((r as { status?: string }).status ?? ""),
          requestType: String(
            (r as { request_type?: string }).request_type ?? "",
          ),
          priority: String((r as { priority?: string }).priority ?? ""),
        });
      }
    }

    const activeJobs: CommandCenterSnapshot["activeJobs"] = [];
    if (!jobsRes.error && jobsRes.data) {
      for (const r of jobsRes.data) {
        const city = String((r as { city?: string }).city ?? "").trim();
        const st = String((r as { state?: string }).state ?? "").trim();
        const location = [city, st].filter(Boolean).join(", ");
        activeJobs.push({
          jobNumber: String((r as { job_number?: string }).job_number ?? ""),
          jobName: String((r as { job_name?: string }).job_name ?? ""),
          status: String((r as { status?: string }).status ?? ""),
          location,
        });
      }
    }

    return { teamOnSite, openRequests, activeJobs };
  } catch {
    return empty;
  }
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

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient(request);
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
    const historySlice = history.slice(-20);
    const anthropicMessages = [
      ...toAnthropicHistory(historySlice),
      { role: "user" as const, content: message },
    ];

    const anthropic = new Anthropic({ apiKey });
    const snapshot = await loadCommandCenterSnapshot(supabase);
    const liveSnapshot = formatCommandCenterSnapshot(snapshot);
    const system = buildSystemPrompt(context, liveSnapshot);

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
  } catch (error) {
    console.error("[ai/assistant] FATAL:", error);
    const msg =
      error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
