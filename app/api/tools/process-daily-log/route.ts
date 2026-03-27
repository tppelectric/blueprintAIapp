import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CLAUDE_OVERLOADED_USER_MESSAGE,
  withClaudeOverloadRetries,
} from "@/lib/ai-api-retries";
import { checkAiRouteRateLimit } from "@/lib/rate-limit";
import {
  normalizeProcessDailyLogJson,
  type ProcessDailyLogResult,
} from "@/lib/daily-log-ai-types";
import { extractDailyLogJsonString } from "@/lib/daily-log-claude-parse";
import {
  anthropicUsageFromMessage,
  recordApiUsage,
} from "@/lib/record-api-usage";

export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are a field assistant for TPP Electrical Contractors. Extract information from field reports.

Return ONLY valid JSON with exactly these keys (snake_case as shown):
{
  "job_name": string or null,
  "work_completed": string,
  "materials_used": [{"item": string, "qty": string, "unit": string}],
  "materials_needed": [{"item": string, "qty": string, "unit": string}],
  "employees_onsite": string[],
  "check_in": string or null,
  "check_out": string or null,
  "issues_delays": string or null,
  "safety_incident": boolean,
  "all_breakers_on": boolean,
  "equipment_used": string or null,
  "equipment_left": string or null,
  "next_day_plan": string or null,
  "notes": string or null,
  "trades_onsite": string or null,
  "visitors_onsite": string or null,
  "job_status": string or null,
  "additional_notes": string or null,
  "crew_user": string or null
}

Rules:
- Use empty string "" only where a string is required but unknown; use null for optional unknowns where allowed.
- check_in and check_out should be times like "7:00 AM" or "15:30" if mentioned.
- materials_used and materials_needed: split quantities into qty and unit (e.g. qty "50", unit "ft").
- employees_onsite: first names or full names as strings.
- safety_incident true only if an incident is described.
- all_breakers_on false if the narrative says breakers were left off or panels open without all on.
- No markdown, no code fences, no commentary — only the JSON object.`;

export async function POST(request: Request) {
  const rl = checkAiRouteRateLimit(request, "process-daily-log");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY in .env.local." },
      { status: 500 },
    );
  }

  let body: {
    transcript?: string;
    jobId?: string | null;
    date?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const transcript = String(body.transcript ?? "").trim();
  if (transcript.length < 10) {
    return NextResponse.json(
      { error: "Transcript must be at least 10 characters." },
      { status: 400 },
    );
  }
  if (transcript.length > 48_000) {
    return NextResponse.json({ error: "Transcript is too long." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let jobsHint = "";
  const { data: jobList } = await supabase
    .from("jobs")
    .select("id,job_name,job_number")
    .order("updated_at", { ascending: false })
    .limit(80);
  if (jobList?.length) {
    jobsHint = jobList
      .map(
        (j) =>
          `- id=${j.id as string} | ${String(j.job_number ?? "").trim()} · ${String(j.job_name ?? "").trim()}`,
      )
      .join("\n");
  }

  let selectedJob = "";
  const jid = body.jobId?.trim();
  if (jid) {
    const { data: one } = await supabase
      .from("jobs")
      .select("job_name,job_number")
      .eq("id", jid)
      .maybeSingle();
    if (one) {
      selectedJob = `User selected job: ${String(one.job_number ?? "")} · ${String(one.job_name ?? "")} (id ${jid})\n`;
    }
  }

  const logDate = body.date?.trim() || new Date().toISOString().slice(0, 10);
  const userBlock = `${selectedJob}Log date (context): ${logDate}

Known jobs (match job_name to these when possible):
${jobsHint || "(none listed)"}

FIELD REPORT / TRANSCRIPT:
${transcript}

Respond with ONLY the JSON object as specified.`;

  const anthropic = new Anthropic({ apiKey });

  let rawText: string;
  try {
    const claudeMsg = await withClaudeOverloadRetries(() =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        stream: false,
        system: SYSTEM,
        messages: [{ role: "user", content: userBlock }],
      }),
    );
    const usage = anthropicUsageFromMessage(claudeMsg);
    await recordApiUsage({
      route: "process-daily-log",
      model: MODEL,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      userId: user.id,
      projectId: null,
    });
    rawText = claudeMsg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
    console.log("[process-daily-log] Claude raw response:", rawText);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Claude API request failed.";
    const status =
      message === CLAUDE_OVERLOADED_USER_MESSAGE ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  const rawForClient =
    rawText.length > 120_000 ? `${rawText.slice(0, 120_000)}\n… (truncated)` : rawText;

  const extracted = extractDailyLogJsonString(rawText);
  if (!extracted) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not extract a JSON object from the AI response. Try again or shorten your description.",
        rawResponse: rawForClient,
      },
      { status: 502 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted);
  } catch (parseErr) {
    const msg =
      parseErr instanceof Error ? parseErr.message : "JSON.parse failed.";
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid JSON from AI: ${msg}`,
        rawResponse: rawForClient,
        extractedSnippet:
          extracted.length > 8_000
            ? `${extracted.slice(0, 8_000)}…`
            : extracted,
      },
      { status: 502 },
    );
  }

  const result: ProcessDailyLogResult = normalizeProcessDailyLogJson(parsed);
  return NextResponse.json({ ok: true, data: result });
}
