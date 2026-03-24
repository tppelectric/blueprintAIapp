import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  OPENAI_RATE_LIMIT_USER_MESSAGE,
  withOpenAIRateLimitRetries,
} from "@/lib/ai-api-retries";
import { MAX_IMAGE_BYTES } from "@/lib/pdf-page-image";

export const maxDuration = 180;

const MAX_INCOMING_IMAGE_BYTES = Math.floor(4.8 * 1024 * 1024);

function extractJsonArray(text: string): unknown[] {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = (fence ? fence[1] : trimmed).trim();
  const parsed = JSON.parse(payload) as unknown;
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    for (const key of ["verifications", "items", "results", "counts"]) {
      const arr = o[key];
      if (Array.isArray(arr)) return arr;
    }
  }
  throw new Error(
    "Expected a JSON array (or object with items/verifications array) from GPT-4o.",
  );
}

type ClaudeItemInput = {
  id: string;
  description: string;
  quantity: number;
};

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing OPENAI_API_KEY in .env.local." },
      { status: 500 },
    );
  }

  let body: {
    projectId?: string;
    pageNumber?: number;
    imageBase64?: string;
    imageMediaType?: string;
    claudeItems?: ClaudeItemInput[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const pageNumber = body.pageNumber;
  const imageBase64 = body.imageBase64?.trim();
  const claudeItems = body.claudeItems;

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json({ error: "Invalid projectId." }, { status: 400 });
  }
  if (
    typeof pageNumber !== "number" ||
    !Number.isInteger(pageNumber) ||
    pageNumber < 1
  ) {
    return NextResponse.json(
      { error: "pageNumber must be a positive integer." },
      { status: 400 },
    );
  }
  if (!imageBase64 || imageBase64.length < 50) {
    return NextResponse.json(
      { error: "imageBase64 is required." },
      { status: 400 },
    );
  }
  const decodedBytes = Buffer.from(imageBase64, "base64").length;
  if (decodedBytes > MAX_INCOMING_IMAGE_BYTES) {
    return NextResponse.json(
      {
        error:
          "Page image too large — please try reducing scan resolution in settings",
      },
      { status: 400 },
    );
  }
  const mediaTypeRaw = body.imageMediaType?.trim().toLowerCase();
  const openAiMime =
    mediaTypeRaw === "image/jpeg" ? "image/jpeg" : "image/png";

  if (!Array.isArray(claudeItems) || claudeItems.length === 0) {
    return NextResponse.json({ items: [], message: "Nothing to verify." });
  }

  const inputLines = claudeItems.map((c) => ({
    id: c.id,
    description: c.description,
    claude_count: Math.round(Number(c.quantity)),
  }));

  const validIds = new Set(inputLines.map((l) => l.id));

  const prompt = `You are an electrical estimator verifying a blueprint takeoff. Another AI listed these line items with counts for THIS PAGE ONLY:

${JSON.stringify(inputLines, null, 2)}

Look at the blueprint image. For EACH line (by id), count how many of that item you see on the page.

Return ONLY a JSON array with EXACTLY one object per input id (same ids, no extras, no omissions):
[
  { "id": "<uuid from input>", "gpt_count": <integer >= 0>, "confidence": <0.0 to 1.0> }
]

Rules:
- Every id from the input must appear exactly once.
- gpt_count is YOUR independent count for that line on this page.
- If you cannot count that symbol, use "gpt_count": null and confidence <= 0.5.

Return raw JSON only, no markdown.`;

  const openai = new OpenAI({ apiKey });

  let assistantText: string;
  try {
    const completion = await withOpenAIRateLimitRetries(() =>
      openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${openAiMime};base64,${imageBase64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
      }),
    );
    assistantText = completion.choices[0]?.message?.content ?? "";
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "OpenAI API request failed.";
    const status =
      message === OPENAI_RATE_LIMIT_USER_MESSAGE ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  let gptParsed: Array<{
    id?: string;
    gpt_count?: number | null;
    confidence?: number;
  }>;
  try {
    gptParsed = extractJsonArray(assistantText) as typeof gptParsed;
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Could not parse GPT-4o response as JSON.",
        raw: assistantText.slice(0, 2000),
      },
      { status: 422 },
    );
  }

  const gptById = new Map<
    string,
    { gpt_count: number | null; confidence: number }
  >();
  for (const row of gptParsed) {
    const id = row.id ? String(row.id).trim() : "";
    if (!id || !validIds.has(id)) continue;
    let gptCount: number | null = null;
    if (row.gpt_count !== null && row.gpt_count !== undefined) {
      const n = Number(row.gpt_count);
      if (Number.isFinite(n) && n >= 0) {
        gptCount = Math.round(n);
      }
    }
    const conf =
      typeof row.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.min(1, Math.max(0, row.confidence))
        : 0.75;
    gptById.set(id, { gpt_count: gptCount, confidence: conf });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Supabase service client is not configured.",
      },
      { status: 500 },
    );
  }

  const updatedRows: unknown[] = [];

  for (const line of inputLines) {
    const row = claudeItems.find((c) => c.id === line.id);
    if (!row) continue;

    const claudeQty = Math.round(Number(row.quantity));
    const gptEntry = gptById.get(line.id);
    const gptCount = gptEntry?.gpt_count ?? null;

    let verification_status: string;
    let final_count: number | null;

    // Never auto-confirm without a GPT count that exactly matches Claude.
    if (gptCount === null) {
      verification_status = "review_needed";
      final_count = null;
    } else {
      const diff = Math.abs(claudeQty - gptCount);
      if (diff === 0) {
        verification_status = "confirmed";
        final_count = claudeQty;
      } else if (diff === 1) {
        verification_status = "review_needed";
        final_count = null;
      } else {
        verification_status = "conflict";
        final_count = null;
      }
    }

    const { data, error } = await supabase
      .from("electrical_items")
      .update({
        gpt_count: gptCount,
        final_count,
        verification_status,
        verified_by: "auto",
      })
      .eq("id", line.id)
      .eq("project_id", projectId)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message, itemId: line.id },
        { status: 500 },
      );
    }
    if (data) updatedRows.push(data);
  }

  return NextResponse.json({ items: updatedRows });
}
