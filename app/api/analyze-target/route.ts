import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  extractAnalyzePayload,
  normalizeAnalysisItem,
  normalizeAnalysisRoom,
  type IncomingItem,
  type IncomingRoom,
} from "@/lib/claude-blueprint-analysis";
import { buildAnalysisLegendAppendix } from "@/lib/analysis-legend-context";
import { MAX_IMAGE_BYTES } from "@/lib/pdf-page-image";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const maxDuration = 120;

const MAX_INCOMING_IMAGE_BYTES = Math.floor(4.8 * 1024 * 1024);

const MODEL = "claude-sonnet-4-6";

const TARGET_SYSTEM = `You are a licensed electrical estimator reading commercial and residential electrical blueprints under NEC 2023.

TARGET SCAN MODE — the user will name ONE specific thing to find. Your job is to look ONLY for that on this page, count every instance precisely, and return results in the same JSON format as a full analysis.

Return ONLY valid JSON (no markdown fences). Shape:
{
  "electrical_items": [
    {
      "category": "fixture" | "panel" | "wiring" | "plan_note",
      "description": "string",
      "specification": "string",
      "quantity": number,
      "unit": "EA" | "LF" | "LOT" | "NOTE",
      "confidence": number 0.5 to 1.0,
      "raw_note": string or null,
      "which_room": "string — room label or UNASSIGNED"
    }
  ],
  "rooms": [
    {
      "room_name": "string",
      "room_type": "living_room|bedroom|kitchen|bathroom|garage|dining_room|hallway|laundry|outdoor|basement|office|utility|other",
      "approximate_width_ft": number or null,
      "approximate_length_ft": number or null,
      "approximate_sq_ft": number or null,
      "confidence": number 0 to 1
    }
  ]
}

Rules:
- Include ONLY electrical_items that match the user's target request. Do not list unrelated takeoff lines.
- Count each symbol instance; quantity is the count for that line.
- confidence below 0.5: omit the item.
- rooms: include rooms only if helpful for context; may be an empty array.`;

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
    targetQuery?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const pageNumber = body.pageNumber;
  const imageBase64 = body.imageBase64?.trim();
  const targetQuery = body.targetQuery?.trim();

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
  const mediaTypeRaw = body.imageMediaType?.trim().toLowerCase();
  const claudeMediaType =
    mediaTypeRaw === "image/jpeg" ? "image/jpeg" : "image/png";

  if (!targetQuery || targetQuery.length < 2) {
    return NextResponse.json(
      { error: "targetQuery is required (at least 2 characters)." },
      { status: 400 },
    );
  }

  let legendAppendix = "";
  try {
    const supabaseLegend = createServiceRoleClient();
    const { data: symRows, error: symErr } = await supabaseLegend
      .from("project_symbols")
      .select("symbol_description, symbol_category, confidence, note_category")
      .eq("project_id", projectId)
      .order("source_page", { ascending: true });
    if (!symErr && symRows?.length) {
      legendAppendix = buildAnalysisLegendAppendix(symRows);
    }
  } catch {
    /* optional */
  }

  const noLegend =
    "\n\nNo project-specific symbol legend is on file — use standard NEC and conventional blueprint electrical symbols.";

  const systemUsed =
    TARGET_SYSTEM +
    (legendAppendix.length > 0 ? legendAppendix : noLegend);

  const userLine = `Look ONLY for the following on this page. Count every instance precisely.\n\nTARGET: ${targetQuery}\n\nReturn ONLY the JSON object with electrical_items and rooms.`;

  const anthropic = new Anthropic({ apiKey });

  let assistantText: string;
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16384,
      system: systemUsed,
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
            { type: "text", text: userLine },
          ],
        },
      ],
    });

    assistantText = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Claude API request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  let payload: { electrical_items: unknown[]; rooms: unknown[] };
  try {
    payload = extractAnalyzePayload(assistantText);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Could not parse Claude response as JSON.",
        raw: assistantText.slice(0, 2000),
      },
      { status: 422 },
    );
  }

  type ItemOut = {
    id: string;
    project_id: string;
    page_number: number;
    category: string;
    description: string;
    specification: string;
    quantity: number;
    unit: string;
    confidence: number;
    raw_note: string | null;
    verification_status: string;
    gpt_count: null;
    final_count: null;
    verified_by: null;
  };

  const items: ItemOut[] = [];
  for (const entry of payload.electrical_items) {
    if (!entry || typeof entry !== "object") continue;
    const normalized = normalizeAnalysisItem(entry as IncomingItem);
    if (normalized) {
      items.push({
        id: randomUUID(),
        project_id: projectId,
        page_number: pageNumber,
        ...normalized,
        verification_status: "pending",
        gpt_count: null,
        final_count: null,
        verified_by: null,
      });
    }
  }

  type RoomOut = {
    id: string;
    project_id: string;
    page_number: number;
    room_name: string;
    room_type: string;
    width_ft: number | null;
    length_ft: number | null;
    sq_ft: number | null;
    confidence: number;
  };

  const rooms: RoomOut[] = [];
  for (const entry of payload.rooms) {
    if (!entry || typeof entry !== "object") continue;
    const nr = normalizeAnalysisRoom(entry as IncomingRoom);
    if (nr) {
      rooms.push({
        id: randomUUID(),
        project_id: projectId,
        page_number: pageNumber,
        ...nr,
      });
    }
  }

  return NextResponse.json({
    items,
    rooms,
    targetQuery,
  });
}
