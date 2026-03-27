import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CLAUDE_OVERLOADED_USER_MESSAGE,
  withClaudeOverloadRetries,
} from "@/lib/ai-api-retries";
import { checkAiRouteRateLimit } from "@/lib/rate-limit";
import {
  extractJsonObjectFromModelText,
  safeParseAnalysis,
} from "@/lib/project-describer-types";
import { TPP_COMPANY_FULL } from "@/lib/tpp-branding";
import {
  anthropicUsageFromMessage,
  recordApiUsage,
} from "@/lib/record-api-usage";

export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are an expert electrical and low voltage contractor estimator with 25 years of experience.
You work for ${TPP_COMPANY_FULL} standards: professional documentation, NEC-aware language where relevant, and clear contractor-grade assumptions.

You must respond with ONLY valid JSON.
No text before or after the JSON.
No markdown code blocks.
Start your response with { and end with }

Analyze this project description and optional trade hints. Infer rooms and devices from the narrative (e.g. "8 zones of audio" → rooms/areas with devices, "Lutron throughout" → systems/brands).

Return exactly this JSON shape (camelCase keys):
{
  "projectTypes": string[],
  "scopeSize": "small" | "medium" | "large" | "commercial",
  "budgetRange": string,
  "rooms": [{
    "name": string,
    "type": string,
    "floor": number,
    "sqft": number,
    "devices": string[]
  }],
  "systems": string[],
  "brands": string[],
  "complexity": string,
  "keyItems": string[]
}

Rules:
- Populate "rooms" with every distinct area mentioned (or reasonable inference). Use floor 1 for main level, 0 for basement, 2+ for upper stories if implied.
- For each room, list "devices" as short strings (e.g. "in-ceiling speakers", "dimmer switches", "WiFi AP", "camera").
- "systems" are platform names (e.g. "Control4", "WiFi", "whole home audio").
- "brands" are manufacturer names if stated (e.g. "Lutron", "Ubiquiti", "Sonos").
- "budgetRange" is a short human string if budget is mentioned, else "Not specified".
- "keyItems" is 4–10 short bullets of scope highlights.
- Be generous with detection — empty rooms[] or empty devices[] only if the description truly has no spatial or device detail.`;

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

  const userBlock = `PROJECT DESCRIPTION:\n${description}\n\nOPTIONAL HINTS (checkboxes): ${hints.length ? hints.join(", ") : "none provided"}\n\nINFERRED PROJECT TYPE TAGS FROM CLIENT: ${projectTypes.length ? projectTypes.join(", ") : "none"}\n\nRespond with ONLY the JSON object as specified.`;

  const anthropic = new Anthropic({ apiKey });

  const supabaseAuth = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  let rawText: string;
  try {
    const claudeMsg = await withClaudeOverloadRetries(() =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 8192,
        stream: false,
        system: SYSTEM,
        messages: [{ role: "user", content: userBlock }],
      }),
    );
    const usage = anthropicUsageFromMessage(claudeMsg);
    await recordApiUsage({
      route: "analyze-project-description",
      model: MODEL,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      userId: authUser?.id ?? null,
      projectId: null,
    });
    rawText = claudeMsg.content
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

  console.log("Claude raw response:", rawText);

  const parsed = safeParseAnalysis(rawText);
  if (!parsed) {
    const extracted = extractJsonObjectFromModelText(rawText);
    let parseError = "Could not parse model response as JSON.";
    if (extracted) {
      try {
        JSON.parse(extracted);
        parseError =
          "Extracted a JSON object but normalization failed (unexpected shape).";
      } catch {
        parseError = "Found JSON-like block but JSON.parse failed.";
      }
    } else {
      parseError = "No JSON object found in the model response.";
    }
    return NextResponse.json(
      {
        error: parseError,
        raw: rawText,
        rawText,
        extractedSnippet: extracted?.slice(0, 4000) ?? null,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ analysis: parsed, rawText });
}
