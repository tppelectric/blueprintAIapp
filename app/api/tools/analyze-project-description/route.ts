import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  CLAUDE_OVERLOADED_USER_MESSAGE,
  withClaudeOverloadRetries,
} from "@/lib/ai-api-retries";
import { checkAiRouteRateLimit } from "@/lib/rate-limit";
import { safeParseAnalysis } from "@/lib/project-describer-types";
import { TPP_COMPANY_FULL } from "@/lib/tpp-branding";

export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are an expert electrical and low voltage contractor estimator with 25 years of experience.
You work for ${TPP_COMPANY_FULL} standards: professional documentation, NEC-aware language where relevant, and clear contractor-grade assumptions.

Analyze the user's free-form project description and optional trade hints.

Extract and return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "project_types": ["string array — e.g. electrical, wifi, av, smarthome, low_voltage, security, lighting"],
  "scope_size": "small" | "medium" | "large" | "commercial",
  "budget_min_usd": number or null,
  "budget_max_usd": number or null,
  "budget_label": "short human summary of budget if stated, else null",
  "rooms": [
    {
      "name": "room or area name",
      "floor": integer or null (1 = main, 2 = second, 0 = basement),
      "approximate_sq_ft": number or null,
      "approximate_width_ft": number or null,
      "approximate_length_ft": number or null,
      "room_type": "living_room | bedroom | kitchen | basement | patio | office | garage | other | ..."
    }
  ],
  "devices": [
    { "category": "speakers | displays | cameras | dimmers | access_points | keypads | etc.", "quantity": number, "notes": "string or null", "room": "optional room name" }
  ],
  "systems": [
    { "name": "e.g. Control4", "role": "automation | lighting | network | av", "brand": "string or null" }
  ],
  "special_requirements": ["string"],
  "complexity": "low | moderate | high | very_high",
  "room_count_estimate": number,
  "key_items_summary": "2–4 sentences summarizing scope for a PM"
}

Rules:
- Be specific on quantities when the user states them; infer reasonable counts only when necessary and note uncertainty in notes.
- Always err on the side of fuller coverage for professional estimates.
- If square footage is given for the building but not per room, distribute reasonably across listed rooms or add a single "Open plan" area.
- If no budget is stated, use null for budget fields and explain in budget_label.`;

export async function POST(request: Request) {
  const rl = checkAiRouteRateLimit(request, "analyze-project-description");
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
    description?: string;
    projectTypes?: string[];
    hints?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const description = String(body.description ?? "").trim();
  if (description.length < 20) {
    return NextResponse.json(
      { error: "Description must be at least 20 characters." },
      { status: 400 },
    );
  }
  if (description.length > 48_000) {
    return NextResponse.json(
      { error: "Description is too long." },
      { status: 400 },
    );
  }

  const hints = Array.isArray(body.hints) ? body.hints : [];
  const projectTypes = Array.isArray(body.projectTypes) ? body.projectTypes : [];

  const userBlock = `PROJECT DESCRIPTION:\n${description}\n\nOPTIONAL HINTS (checkboxes): ${hints.length ? hints.join(", ") : "none provided"}\n\nINFERRED PROJECT TYPE TAGS FROM CLIENT: ${projectTypes.length ? projectTypes.join(", ") : "none"}\n\nReturn only the JSON object.`;

  const anthropic = new Anthropic({ apiKey });

  let text: string;
  try {
    const msg = await withClaudeOverloadRetries(() =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 8192,
        stream: false,
        system: SYSTEM,
        messages: [{ role: "user", content: userBlock }],
      }),
    );
    text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Claude API request failed.";
    const status =
      message === CLAUDE_OVERLOADED_USER_MESSAGE ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  const parsed = safeParseAnalysis(text);
  if (!parsed) {
    return NextResponse.json(
      {
        error: "Could not parse model response.",
        raw: text.slice(0, 2500),
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ analysis: parsed, rawText: text });
}
