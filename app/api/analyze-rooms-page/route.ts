import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  extractRoomScanPayload,
  normalizeAnalysisRoom,
  type IncomingRoom,
} from "@/lib/claude-blueprint-analysis";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  CLAUDE_OVERLOADED_USER_MESSAGE,
  withClaudeOverloadRetries,
} from "@/lib/ai-api-retries";
import { checkAiRouteRateLimit } from "@/lib/rate-limit";
import {
  anthropicUsageFromMessage,
  recordApiUsage,
} from "@/lib/record-api-usage";

export const maxDuration = 180;

const MAX_INCOMING_IMAGE_BYTES = Math.floor(4.8 * 1024 * 1024);
const MODEL = "claude-sonnet-4-6";

const STRICT_JSON_ADDENDUM = `

IMPORTANT: You MUST respond with valid JSON only: a single JSON object with keys "rooms" (array) and "floor_count" (positive integer, typically 1–4, based on title block, level labels, or plan context). If unclear, use 1. If the page has no room or area information, return {"rooms":[],"floor_count":1}. Never respond with plain text, apologies, or markdown. Only the JSON object.`;

const ROOM_SCAN_SYSTEM = `You are an experienced architect and estimator reading construction blueprints.

Task: Identify every room, suite, or labeled area on this page and estimate dimensions when possible.

Include:
- All labeled rooms (bedroom, office, etc.)
- Hallways, corridors, foyers, stairs, closets, storage, mechanical/electrical rooms, restrooms, kitchens, lobbies
- Garage, patio, deck, covered porch when shown

For each space return:
{
  room_name: string (use plan spelling or clear descriptive name),
  room_type: one of: living_room, bedroom, kitchen, bathroom, garage, dining_room, hallway, laundry, outdoor, basement, office, utility, other,
  approximate_width_ft: number or null,
  approximate_length_ft: number or null,
  approximate_sq_ft: number or null (prefer when shown on drawing or calculable from scale),
  confidence: number 0.0–1.0
}

Also set floor_count in the root object: total building stories/floors suggested by the title block, sheet name (e.g. LEVEL 2), or typical residential/commercial context. Minimum 1.

Return exactly this JSON shape:
{
  "rooms": [ ... ],
  "floor_count": <integer>
}`;

function claudeTextLooksLikeJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[");
}

function sumSqFt(
  rooms: Array<{
    width_ft: number | null;
    length_ft: number | null;
    sq_ft: number | null;
  }>,
): number {
  let t = 0;
  for (const r of rooms) {
    if (r.sq_ft != null && Number.isFinite(r.sq_ft) && r.sq_ft > 0) {
      t += r.sq_ft;
    } else if (
      r.width_ft != null &&
      r.length_ft != null &&
      r.width_ft > 0 &&
      r.length_ft > 0
    ) {
      t += r.width_ft * r.length_ft;
    }
  }
  return Math.round(t);
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY in .env.local." },
      { status: 500 },
    );
  }

  let body: {
    projectId?: string;
    pageNumber?: number;
    imageBase64?: string;
    imageMediaType?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json({ error: "Invalid projectId." }, { status: 400 });
  }
  const pageNumber = body.pageNumber;
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
  const imageBase64 = body.imageBase64?.trim();
  if (!imageBase64 || imageBase64.length < 50) {
    return NextResponse.json(
      { error: "imageBase64 is required (PNG base64, no data URL prefix)." },
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

  const aiRl = checkAiRouteRateLimit(request, "analyze-rooms-page");
  if (!aiRl.allowed) {
    return NextResponse.json(
      { error: "Too many room scans. Try again in a minute." },
      {
        status: 429,
        headers: { "Retry-After": String(aiRl.retryAfterSeconds) },
      },
    );
  }

  const mediaTypeRaw = body.imageMediaType?.trim().toLowerCase();
  const claudeMediaType =
    mediaTypeRaw === "image/jpeg" ? "image/jpeg" : "image/png";

  const anthropic = new Anthropic({ apiKey });

  const usageTotals = { inputTokens: 0, outputTokens: 0 };

  async function runClaude(
    userText: string,
    b64: string,
    media: "image/png" | "image/jpeg",
  ): Promise<string> {
    const msg = await withClaudeOverloadRetries(() =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 8192,
        stream: false,
        system: ROOM_SCAN_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: media,
                  data: b64,
                },
              },
              { type: "text", text: userText },
            ],
          },
        ],
      }),
    );
    const u = anthropicUsageFromMessage(msg);
    usageTotals.inputTokens += u.inputTokens;
    usageTotals.outputTokens += u.outputTokens;
    if (!("content" in msg) || !Array.isArray(msg.content)) {
      throw new Error("Invalid Claude response shape.");
    }
    return msg.content
      .map(
        (b: { type: string; text?: string }) =>
          b.type === "text" ? (b.text ?? "") : "",
      )
      .join("\n")
      .trim();
  }

  const baseUser =
    "Analyze this blueprint page for rooms and square footage only. Return ONLY the JSON object with keys rooms and floor_count as specified.";

  let assistantText: string;
  try {
    assistantText = await runClaude(
      baseUser,
      imageBase64,
      claudeMediaType,
    );
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Claude API request failed.";
    const status =
      message === CLAUDE_OVERLOADED_USER_MESSAGE ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  let payload: { rooms: unknown[]; floor_count: number } | null = null;
  try {
    if (claudeTextLooksLikeJson(assistantText)) {
      payload = extractRoomScanPayload(assistantText);
    }
  } catch {
    payload = null;
  }

  if (!payload) {
    try {
      const t2 = await runClaude(
        baseUser + STRICT_JSON_ADDENDUM,
        imageBase64,
        claudeMediaType,
      );
      if (claudeTextLooksLikeJson(t2)) payload = extractRoomScanPayload(t2);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Claude API request failed.";
      const status =
        message === CLAUDE_OVERLOADED_USER_MESSAGE ? 503 : 502;
      return NextResponse.json({ error: message }, { status });
    }
  }

  if (!payload) {
    return NextResponse.json(
      { error: "Could not parse room scan response. Try again." },
      { status: 502 },
    );
  }

  const roomRows: Array<{
    project_id: string;
    page_number: number;
    room_name: string;
    room_type: string;
    width_ft: number | null;
    length_ft: number | null;
    sq_ft: number | null;
    confidence: number;
  }> = [];

  for (const entry of payload.rooms) {
    if (!entry || typeof entry !== "object") continue;
    const nr = normalizeAnalysisRoom(entry as IncomingRoom);
    if (nr)
      roomRows.push({
        project_id: projectId,
        page_number: pageNumber,
        ...nr,
      });
  }

  if (roomRows.length === 0) {
    return NextResponse.json(
      {
        error: "No rooms met the confidence threshold on this page.",
      },
      { status: 422 },
    );
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

  const { error: delRoomErr } = await supabase
    .from("detected_rooms")
    .delete()
    .eq("project_id", projectId)
    .eq("page_number", pageNumber);

  if (delRoomErr) {
    return NextResponse.json(
      {
        error: delRoomErr.message,
        hint: "Ensure detected_rooms table exists.",
      },
      { status: 500 },
    );
  }

  const { data: insertedRooms, error: roomErr } = await supabase
    .from("detected_rooms")
    .insert(roomRows)
    .select();

  if (roomErr) {
    return NextResponse.json(
      {
        error: roomErr.message,
        hint: "Check detected_rooms table.",
      },
      { status: 500 },
    );
  }

  const rooms = insertedRooms ?? [];
  const total_sqft = sumSqFt(rooms);
  const floor_count = payload.floor_count;

  await recordApiUsage({
    route: "analyze-rooms-page",
    model: MODEL,
    inputTokens: usageTotals.inputTokens,
    outputTokens: usageTotals.outputTokens,
    projectId,
    pageNumber,
  });

  return NextResponse.json({
    rooms,
    floor_count,
    total_sqft,
    persisted: true,
  });
}
