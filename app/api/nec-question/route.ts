import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  CLAUDE_OVERLOADED_USER_MESSAGE,
  withClaudeOverloadRetries,
} from "@/lib/ai-api-retries";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkAiRouteRateLimit } from "@/lib/rate-limit";
import {
  anthropicUsageFromMessage,
  recordApiUsage,
} from "@/lib/record-api-usage";

export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a licensed master electrician and NEC code expert with 25 years of experience.
You specialize in New York State electrical code requirements.

When answering questions:
1. Always cite the specific NEC article and section (example: NEC 210.8(A))
2. Give a clear plain English answer first
3. Then provide the technical code reference
4. Note any New York State amendments if relevant
5. If the question involves a permit date near December 30 2025 note the 2017 vs 2023 NEC transition for NYS
6. Keep answers concise but complete
7. If unsure say so — never guess at code

Format your response as:
ANSWER: [plain English answer]
NEC REFERENCE: [article and section]
NYS NOTE: [any NY specific info or 'None']
ADDITIONAL: [any important related info]`;

function extractAssistantText(msg: Anthropic.Messages.Message): string {
  return msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  const rl = checkAiRouteRateLimit(request, "nec-question");
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
    question?: string;
    jurisdiction?: string;
    nec_edition?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const question = String(body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "question is required." }, { status: 400 });
  }
  if (question.length > 8000) {
    return NextResponse.json({ error: "Question too long." }, { status: 400 });
  }

  const jurisdiction = String(body.jurisdiction ?? "NY").trim().slice(0, 32) || "NY";
  const nec_edition = String(body.nec_edition ?? "2023").trim().slice(0, 16) || "2023";

  const userMessage = `Jurisdiction (state): ${jurisdiction}
NEC edition context for this session: ${nec_edition}

Question:
${question}`;

  const anthropic = new Anthropic({ apiKey });

  const supabaseAuth = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();
  if (!authUser?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let answerText: string;
  try {
    const claudeMsg = await withClaudeOverloadRetries(() =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        stream: false,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    );
    const usage = anthropicUsageFromMessage(claudeMsg);
    await recordApiUsage({
      route: "nec-question",
      model: MODEL,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      userId: authUser?.id ?? null,
      projectId: null,
    });
    answerText = extractAssistantText(claudeMsg);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Claude API request failed.";
    const status =
      message === CLAUDE_OVERLOADED_USER_MESSAGE ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  if (!answerText) {
    return NextResponse.json(
      { error: "Empty response from model." },
      { status: 502 },
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("nec_questions").insert({
      question,
      answer: answerText,
      jurisdiction,
      nec_edition,
    });
    if (error) {
      console.error("[nec-question] Supabase insert failed:", error.message);
    }
  } catch (e) {
    console.error("[nec-question] Supabase insert exception:", e);
  }

  return NextResponse.json({ answer: answerText });
}
