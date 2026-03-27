import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CLAUDE_OVERLOADED_USER_MESSAGE,
  withClaudeOverloadRetries,
} from "@/lib/ai-api-retries";
import { checkAiRouteRateLimit } from "@/lib/rate-limit";
import {
  extractReceiptJsonString,
  normalizeScanReceiptJson,
} from "@/lib/receipt-scan-types";

export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are an expert at reading retail and supply-house receipts for a construction electrical contractor.

Return ONLY valid JSON (no markdown fences) with exactly these keys:
{
  "vendor_name": string,
  "receipt_date": string (ISO date YYYY-MM-DD if possible, else best effort),
  "subtotal": number,
  "tax_amount": number,
  "total_amount": number,
  "payment_method": string,
  "card_last_four": string or null,
  "card_type": string or null,
  "receipt_category": one of "Materials" | "Gas/Fuel" | "Tools" | "Meals" | "Office" | "Other",
  "line_items": [{"description": string, "quantity": number or null, "unit_price": number or null, "total": number}],
  "confidence": number between 0 and 1 (your confidence in the extraction)
}

Rules:
- Use 0 for unknown numeric amounts; use null only for card_last_four / card_type when not visible.
- line_items: include major lines; if illegible, use a single line with description "Receipt total" and total = total_amount.
- receipt_category: Materials for electrical/supply houses; Gas/Fuel for gas stations; Tools for hardware/tool stores; Meals for restaurants; Office for office supplies; otherwise Other.`;

const ALLOWED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const rl = checkAiRouteRateLimit(request, "scan-receipt");
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
      { error: "Server is missing ANTHROPIC_API_KEY." },
      { status: 500 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    imageBase64?: string;
    mediaType?: string;
    jobId?: string | null;
    dailyLogId?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawB64 = String(body.imageBase64 ?? "").trim();
  if (!rawB64) {
    return NextResponse.json({ error: "imageBase64 is required." }, { status: 400 });
  }

  const base64 = rawB64.includes(",")
    ? rawB64.slice(rawB64.indexOf(",") + 1)
    : rawB64;

  let approxBytes: number;
  try {
    approxBytes = Math.floor((base64.length * 3) / 4);
  } catch {
    approxBytes = 0;
  }
  if (approxBytes > 12 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Image is too large (max ~12 MB)." },
      { status: 400 },
    );
  }

  const mediaType = String(body.mediaType ?? "image/jpeg").toLowerCase();
  if (!ALLOWED_MEDIA.has(mediaType)) {
    return NextResponse.json(
      { error: `Unsupported media type: ${mediaType}` },
      { status: 400 },
    );
  }

  const jobIdRaw =
    body.jobId == null ? "" : String(body.jobId).trim();
  const dailyLogIdRaw =
    body.dailyLogId == null ? "" : String(body.dailyLogId).trim();

  let userContext = "";
  if (jobIdRaw && UUID_RE.test(jobIdRaw)) {
    const { data: job } = await supabase
      .from("jobs")
      .select("job_number,job_name")
      .eq("id", jobIdRaw)
      .maybeSingle();
    if (job) {
      const num = String(job.job_number ?? "").trim();
      const name = String(job.job_name ?? "").trim();
      const label = [num, name].filter(Boolean).join(" · ");
      if (label) {
        userContext += ` User context: this receipt is being captured for job: ${label}.`;
      }
    }
  }
  if (dailyLogIdRaw && UUID_RE.test(dailyLogIdRaw)) {
    userContext +=
      " User context: this scan is part of a field daily log (materials / expenses may be job-related).";
  }

  const anthropic = new Anthropic({ apiKey });

  let rawText: string;
  try {
    const msg = await withClaudeOverloadRetries(() =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        stream: false,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType as
                    | "image/jpeg"
                    | "image/png"
                    | "image/gif"
                    | "image/webp",
                  data: base64,
                },
              },
              {
                type: "text",
                text:
                  "Extract receipt data as JSON only per the schema." +
                  userContext,
              },
            ],
          },
        ],
      }),
    );
    rawText = msg.content
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

  const rawForClient =
    rawText.length > 80_000 ? `${rawText.slice(0, 80_000)}\n… (truncated)` : rawText;

  const extracted = extractReceiptJsonString(rawText);
  if (!extracted) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not parse receipt data from the AI response. Try a clearer photo.",
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
      },
      { status: 502 },
    );
  }

  const data = normalizeScanReceiptJson(parsed);
  return NextResponse.json({
    ok: true,
    data,
    rawResponse: rawForClient,
  });
}
