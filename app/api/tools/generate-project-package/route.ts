import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  CLAUDE_OVERLOADED_USER_MESSAGE,
  withClaudeOverloadRetries,
} from "@/lib/ai-api-retries";
import { checkAiRouteRateLimit } from "@/lib/rate-limit";
import {
  safeParseGeneratedPackage,
  type ProjectDescriptionAnalysis,
} from "@/lib/project-describer-types";
import { TPP_COMPANY_FULL } from "@/lib/tpp-branding";

export const maxDuration = 180;

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are a senior project manager and estimator for ${TPP_COMPANY_FULL}.
Generate a complete contractor document package from the project description and structured analysis JSON.

Use:
- TPP Electric professional tone and internal standards
- Industry-typical low-voltage, AV, smart home, and electrical scope language
- NEC references only where clearly applicable (cite article/table when you mention code)
- Good / Better / Best tiers in the client proposal where it fits

Return ONLY valid JSON (no markdown) with these string values (use plain text with newlines inside strings, not markdown headings):
{
  "internalWorkScope": "full internal technical scope, room-by-room, materials and labor narrative, letterhead line: ${TPP_COMPANY_FULL}",
  "fieldWorkOrder": "technician checklist, room-by-room tasks, materials to bring, testing checklist, sign-off blocks",
  "clientProposal": "client-facing, plain English, investment summary with Good/Better/Best, timeline, warranty, approval signature line, TPP branding",
  "billOfMaterials": "categories, line items with qty, unit cost estimate, markup note, extended customer price, grand total section",
  "laborEstimate": "tasks, hours by task, tech count, total hours, labor rate line and total labor sell"
}

Each field must be substantial (multiple paragraphs where appropriate) and copy-ready.`;

export async function POST(request: Request) {
  const rl = checkAiRouteRateLimit(request, "generate-project-package");
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
    analysis?: ProjectDescriptionAnalysis;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const description = String(body.description ?? "").trim();
  if (description.length < 10) {
    return NextResponse.json(
      { error: "Description is required." },
      { status: 400 },
    );
  }
  if (!body.analysis || typeof body.analysis !== "object") {
    return NextResponse.json(
      { error: "analysis object is required." },
      { status: 400 },
    );
  }

  const analysisJson = JSON.stringify(body.analysis, null, 2);

  const userBlock = `ORIGINAL DESCRIPTION:\n${description}\n\nSTRUCTURED ANALYSIS (JSON):\n${analysisJson}\n\nProduce the five document strings as specified. JSON only.`;

  const anthropic = new Anthropic({ apiKey });

  let text: string;
  try {
    const msg = await withClaudeOverloadRetries(() =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 16384,
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

  const pkg = safeParseGeneratedPackage(text);
  if (!pkg) {
    return NextResponse.json(
      {
        error: "Could not parse generated package.",
        raw: text.slice(0, 3000),
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ package: pkg });
}
