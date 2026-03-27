import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CLAUDE_OVERLOADED_USER_MESSAGE,
  withClaudeOverloadRetries,
} from "@/lib/ai-api-retries";
import {
  extractFloorPlanScanPayload,
  normalizeFloorPlanScanResponse,
} from "@/lib/tool-floor-plan-scan";
import { checkAiRouteRateLimit } from "@/lib/rate-limit";
import {
  anthropicUsageFromMessage,
  recordApiUsage,
} from "@/lib/record-api-usage";

export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6";
const MAX_INCOMING_IMAGE_BYTES = Math.floor(4.8 * 1024 * 1024);

const BASE_SYSTEM = `You are an expert architectural floor-plan reader. Analyze the attached blueprint/floor-plan image.

TASK:
1. Identify every distinct room or labeled area (bedrooms, baths, kitchen, garage, hallways, closets, mechanical, outdoor/patio/deck, etc.).
2. Estimate dimensions when a scale bar, dimensions, or grid is visible; otherwise infer reasonable approximate length and width in feet from drawing proportions. Use null for dimensions you cannot estimate at all.
3. Assign floor_level as integer: 1 = main/ground, 2 = second story, 3+ = upper levels, 0 = basement/cellar if clearly indicated.
4. Classify room_type using one of: living_room, bedroom, kitchen, bathroom, garage, dining_room, hallway, laundry, outdoor, patio, basement, office, utility, other.

Return ONLY valid JSON (no markdown fences). Shape:
{
  "rooms": [
    {
      "room_name": "string — label from plan or best descriptive name",
      "room_type": "one of the allowed types",
      "floor": integer (0–6),
      "approximate_width_ft": number or null,
      "approximate_length_ft": number or null,
      "approximate_sq_ft": number or null,
      "confidence": number 0.5 to 1.0
    }
  ],
  "equipment_placement_suggestions": [
    "short actionable strings for the selected tool context"
  ],
  "scan_notes": "one paragraph on plan quality, scale, or verification needs"
}

Omit rooms with confidence below 0.5. Be thorough with hallways and utility spaces when visible.`;

const TOOL_SUFFIX: Record<string, string> = {
  wifi: `

TOOL CONTEXT — Wi‑Fi / networking:
In equipment_placement_suggestions, give 4–10 concise tips for AP/switch placement relative to this layout (central coverage, outdoor areas, backhaul paths, avoid metal/plenum assumptions, mesh vs wired APs). Do not repeat the full room list.`,

  av: `

TOOL CONTEXT — Audio / video:
In equipment_placement_suggestions, give 4–10 concise tips for speaker, display, rack, and subwoofer placement by room where relevant; note open-plan adjacencies.`,

  smarthome: `

TOOL CONTEXT — Smart home / control:
In equipment_placement_suggestions, give 4–10 concise tips for keypads, touchscreens, hub location, sensors, and cameras relative to traffic patterns and entries.`,

  electrical: `

TOOL CONTEXT — Electrical planning:
In equipment_placement_suggestions, give 4–10 concise tips for panel location, homerun paths, kitchen small-appliance circuits, bath GFCI, outdoor loads, and EV/spa rough-in considerations. Do not repeat the full room list.`,
};

function extractAssistantText(msg: Anthropic.Messages.Message): string {
  return msg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  const rl = checkAiRouteRateLimit(request, "scan-floor-plan-rooms");
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
    imageBase64?: string;
    imageMediaType?: string;
    tool?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const imageBase64 = body.imageBase64?.trim();
  if (!imageBase64 || imageBase64.length < 50) {
    return NextResponse.json(
      { error: "imageBase64 is required (PNG/JPEG base64, no data URL prefix)." },
      { status: 400 },
    );
  }
  const decodedBytes = Buffer.from(imageBase64, "base64").length;
  if (decodedBytes > MAX_INCOMING_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Image too large for scan — use a smaller export or page." },
      { status: 400 },
    );
  }

  const toolRaw = String(body.tool ?? "wifi").toLowerCase().trim();
  const tool = ["wifi", "av", "smarthome", "electrical"].includes(toolRaw)
    ? toolRaw
    : "wifi";

  const mediaTypeRaw = body.imageMediaType?.trim().toLowerCase();
  const claudeMediaType =
    mediaTypeRaw === "image/jpeg" ? "image/jpeg" : "image/png";

  const system = BASE_SYSTEM + (TOOL_SUFFIX[tool] ?? TOOL_SUFFIX.wifi);

  const anthropic = new Anthropic({ apiKey });

  const supabaseAuth = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  let assistantText: string;
  try {
    const msg = await withClaudeOverloadRetries(() =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 8192,
        system,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: claudeMediaType,
                  data: imageBase64,
                },
              },
              {
                type: "text",
                text: "Extract rooms and equipment suggestions as specified. Return JSON only.",
              },
            ],
          },
        ],
      }),
    );
    const usage = anthropicUsageFromMessage(msg);
    await recordApiUsage({
      route: "scan-floor-plan-rooms",
      model: MODEL,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      userId: authUser?.id ?? null,
      projectId: null,
    });
    assistantText = extractAssistantText(msg);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Claude API request failed.";
    const status =
      message === CLAUDE_OVERLOADED_USER_MESSAGE ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const parsed = extractFloorPlanScanPayload(assistantText);
    const rooms = normalizeFloorPlanScanResponse(parsed.rooms);
    return NextResponse.json({
      rooms,
      equipment_placement_suggestions:
        parsed.equipment_placement_suggestions ?? [],
      scan_notes: parsed.scan_notes ?? "",
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Could not parse model response as JSON.",
        raw: assistantText.slice(0, 2000),
      },
      { status: 422 },
    );
  }
}
