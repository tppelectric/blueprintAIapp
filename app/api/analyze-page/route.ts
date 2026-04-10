import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  extractAnalyzePayload,
  normalizeAnalysisItem,
  normalizeAnalysisRoom,
  type IncomingItem,
  type IncomingRoom,
} from "@/lib/claude-blueprint-analysis";
import { nextSavedScanIndex } from "@/lib/saved-scan-db";
import { formatAutoScanName } from "@/lib/saved-scan-format";
import { buildAnalysisLegendAppendix } from "@/lib/analysis-legend-context";
import { MAX_IMAGE_BYTES } from "@/lib/pdf-page-image";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CLAUDE_OVERLOADED_USER_MESSAGE,
  withClaudeOverloadRetries,
} from "@/lib/ai-api-retries";
import { checkAiRouteRateLimit } from "@/lib/rate-limit";
import { recordAnalyzePageApiUsage } from "@/lib/record-analyze-page-usage";
import { imageBufferAppearsBlank } from "@/lib/analyze-page-image";

export const maxDuration = 180;

/** Safety net: reject oversized payloads before Claude (5 MB API limit). */
const MAX_INCOMING_IMAGE_BYTES = Math.floor(4.8 * 1024 * 1024);

const MODEL = "claude-sonnet-4-6";

/** Shown on the second Claude attempt when the first reply is not usable JSON. */
const STRICT_JSON_USER_ADDENDUM = `

IMPORTANT: You MUST respond with valid JSON only: a single JSON object with keys "electrical_items" and "rooms" (both arrays). If the page has no electrical content at all, return {"electrical_items":[],"rooms":[]}. If the page has panel schedules, riser diagrams, specifications, tables, or other electrical text, you MUST extract them into electrical_items per the system instructions — do not return empty electrical_items in that case. Never respond with plain text, apologies, or markdown. Only the JSON object.`;

function stripMarkdownCodeFences(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function claudeTextLooksLikeJson(text: string): boolean {
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[");
}

function tryExtractAnalyzePayload(
  text: string,
  logCtx: { projectId: string; pageNumber: number; phase: string },
): { electrical_items: unknown[]; rooms: unknown[] } | null {
  try {
    return extractAnalyzePayload(text);
  } catch (e) {
    console.error("[analyze-page] Claude response JSON parse/extract failed:", {
      projectId: logCtx.projectId,
      pageNumber: logCtx.pageNumber,
      phase: logCtx.phase,
      error: e instanceof Error ? e.message : String(e),
      rawResponseText: text,
    });
    return null;
  }
}

type ParsedAnalyzePayload = {
  electrical_items: unknown[];
  rooms: unknown[];
};

type ElectricalItemInsertRow = {
  project_id: string;
  page_number: number;
  verification_status: string;
  category: string;
  description: string;
  specification: string;
  quantity: number;
  unit: string;
  confidence: number;
  which_room: string;
  raw_note: string | null;
  location_nx: number | null;
  location_ny: number | null;
  gpt_count: null;
  final_count: null;
  verified_by: null;
};

type DetectedRoomInsertRow = {
  project_id: string;
  page_number: number;
  floor_number: number;
  room_name: string;
  room_type: string;
  width_ft: number | null;
  length_ft: number | null;
  sq_ft: number | null;
  confidence: number;
};

function materializeElectricalItemRows(
  projectId: string,
  pageNumber: number,
  payload: ParsedAnalyzePayload,
): ElectricalItemInsertRow[] {
  const rows: ElectricalItemInsertRow[] = [];
  for (const entry of payload.electrical_items) {
    if (!entry || typeof entry !== "object") continue;
    const normalized = normalizeAnalysisItem(entry as IncomingItem);
    if (normalized) {
      rows.push({
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
  return rows;
}

function materializeRoomRows(
  projectId: string,
  pageNumber: number,
  payload: ParsedAnalyzePayload,
): DetectedRoomInsertRow[] {
  const roomRows: DetectedRoomInsertRow[] = [];
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
  return roomRows;
}

function aggressiveEmptyRetryUserText(pageNum: number): string {
  return `I am looking at page ${pageNum} of an electrical blueprint. I need you to find ANYTHING electrical on this page.

Please look for:
- Any lines or symbols
- Any text at all
- Any numbers that could be circuit numbers
- Any boxes that could be panels or devices
- ANY marks whatsoever

Even if you cannot identify what something is, describe it as a plan_note.

You MUST return at least one item.
Return everything you can see.

Respond with ONLY valid JSON: one object with keys "electrical_items" and "rooms" (arrays) as specified in the system instructions.`;
}

function fallbackUnclearPlanNoteRow(
  projectId: string,
  pageNumber: number,
): ElectricalItemInsertRow {
  return {
    project_id: projectId,
    page_number: pageNumber,
    verification_status: "pending",
    category: "plan_note",
    description: `Page ${pageNumber} - content unclear - please verify manually`,
    specification: "",
    quantity: 1,
    unit: "NOTE",
    confidence: 0.5,
    which_room: "UNASSIGNED",
    raw_note: null,
    location_nx: null,
    location_ny: null,
    gpt_count: null,
    final_count: null,
    verified_by: null,
  };
}

const SYSTEM_PROMPT = `You are a licensed electrical estimator with 20 years of experience reading commercial and residential electrical blueprints under NEC 2023. Analyze this blueprint page and identify ALL electrical elements.

For each item found return a JSON array with objects:
{
  category: fixture OR panel OR wiring OR plan_note,
  description: item name for materials list,
  specification: technical details like gauge amperage NEMA type,
  quantity: number,
  unit: EA or LF or LOT or NOTE,
  confidence: number between 0.0 and 1.0,
  raw_note: verbatim plan note text or null,
  which_room: string (see ROOM ASSIGNMENT RULES below),
  location_nx: number 0.0-1.0 left-to-right position on the page (centroid if multiple instances spread across page),
  location_ny: number 0.0-1.0 top-to-bottom position on the page (centroid if multiple instances spread across page)
}

ROOM ASSIGNMENT RULES — CRITICAL:
Every single electrical item MUST be assigned to a room. Follow these rules exactly:

1. IDENTIFY ALL ROOMS FIRST
   Before counting any items scan the entire page and list every room and area you can see.
   Include: hallways, closets, storage areas, utility spaces, staircases, any labeled area.

2. ASSIGN BY LOCATION
   Look at where each symbol is physically located on the plan.
   Assign it to whichever room boundary it falls inside.
   For symbols on a wall between two rooms assign to the room the symbol faces into.

3. NEVER USE UNASSIGNED
   Every item must have a room assignment.
   If truly unclear assign to the nearest named room.
   Only use UNASSIGNED for items with no possible room context like panel schedules.

4. SMALL ROOMS MATTER
   Pay special attention to:
   - Hallways and corridors
   - Closets and storage areas
   - Utility and mechanical spaces
   - Mudrooms and entry areas
   - Staircases
   These areas always have electrical items even if small — look carefully.

5. DOUBLE CHECK ASSIGNMENT
   After assigning all items review your list.
   Make sure no room that has visible symbols shows zero items assigned to it.
   If a room shows zero items scan it again.

Match which_room to room labels visible on the drawing when possible. Use the same spelling style as the sheet (you may use ALL CAPS for consistency).

LOCATION: For every item, estimate its position on the page image as normalized coordinates. location_nx is 0.0 at the left edge and 1.0 at the right edge. location_ny is 0.0 at the top edge and 1.0 at the bottom edge. Return the centroid position of all instances of that item type. Be as spatially accurate as possible — look at where the symbols actually appear on the drawing.

IDENTIFY THESE ITEMS:
FIXTURES: Receptacles (standard GFCI AFCI TR WP), lighting (recessed surface wall), ceiling fans, exhaust fans, smoke/CO detectors, dedicated circuits, window and shading devices: motorized shades, manual shades, roller shades, motorized shutters, shade motors, shade panels (motor/head enclosures or power supply modules), shade controls (wall stations, keypads, touchpanels, remotes when shown as devices)

PANELS: Main panels with amperage, subpanels, disconnects, transfer switches

WIRING: Wire gauge and type (NM-B MC EMT PVC), home runs, feeders, low voltage (thermostat, data, doorbell, and shade/Lutron-style control wiring), dedicated power and control homeruns to motorized shades and shade controls, underground. Estimate linear footage if scale bar visible.

PLAN NOTES: All electrical notes, NEC references, panel schedules, AHJ notes. Quote verbatim.

PANEL SCHEDULE DETECTION:
If this page contains a panel schedule table:
- Read every circuit in the schedule
- Extract: circuit number, description,
  breaker size, voltage, phase
- Return each circuit as a plan_note item:
  description: Circuit X - [description]
  specification: [breaker size]A, [voltage]V
  category: plan_note
  confidence: 0.95

RISER DIAGRAM DETECTION:
If this page contains an electrical riser:
- Extract service size
- Extract panel locations and sizes
- Extract feeder sizes
- Return as panel category items

TEXT HEAVY PAGES:
If this page has more text than symbols:
- Read all electrical specifications
- Read all schedules and tables
- Return everything as plan_note items
- Never return empty for a page with
  electrical text content

DIFFICULT PAGE HANDLING:
If symbols are small or densely packed:
- Zoom into each quadrant mentally
- Report items found in each area
- Never return empty for a page with
  visible electrical symbols

If page appears to be a schedule:
- Read every row of the schedule
- Return each circuit as a plan_note
- Include circuit number and description

If page has non-standard symbols:
- Describe what you see
- Make best guess at item type
- Flag with a low-but-valid confidence score in the 0.50–0.69 range (never below 0.50 or items may be discarded)
- Never return empty

If page is very dense:
- Take multiple passes mentally
- Report everything you can identify
- Partial results are better than empty

MINIMUM RESPONSE RULE:
You must always return at least one item
in electrical_items if the page contains ANY electrical content
including text, symbols, schedules, or notes.
If truly empty (no electrical content anywhere), return:
{"electrical_items":[],"rooms":[]}
and you may include an optional top-level "notes" array, e.g.
["Page appears to have no electrical content"].

ABSOLUTE RULE - NEVER RETURN EMPTY:
You must return at least one item for
any page that has electrical content.

For pages with ONLY schedules or tables:
- Read every single row
- Each row becomes one plan_note item
- description: exactly what the row says
- category: plan_note
- confidence: 0.90

For pages with ONLY text/notes:
- Each paragraph or note becomes one item
- category: plan_note
- confidence: 0.85

For pages with small or unclear symbols:
- Describe what you think you see
- Use confidence 0.50-0.65
- Include it anyway

The only valid reason to return empty items
is if the page is completely blank white
with absolutely no marks whatsoever.

COUNTING RULES - THIS IS CRITICAL:
- Count every single symbol individually, one by one
- Do not estimate or guess quantities
- Scan the entire page systematically:
  * Start at top left, move right across the page
  * Then move down one row and repeat
  * Never skip any area of the page
- Count symbols near walls, corners, and edges carefully
- Count symbols that are close together separately
- If a symbol is partially covered by text or lines, still count it
- Double check your count before returning results
- For receptacles specifically: count every duplex, GFCI, AFCI, and specialty outlet as separate items
- When in doubt count it - the estimator will verify

RECEPTACLE DETECTION - PAY SPECIAL ATTENTION:
- Look for any of these symbols: circle with two slots, duplex outlet symbol, the standard outlet symbol which looks like a circle with two vertical lines
- Count EVERY outlet symbol on the page individually
- Receptacles are often near walls, at counter height, or along baseboards
- They may be labeled with circuit numbers nearby
- Do not skip any outlet symbol even if small or near other symbols
- GFCI outlets have a small T or GFI label next to them

Confidence guide:
0.90 to 1.0 = clear and unambiguous
0.70 to 0.89 = likely correct minor uncertainty
0.50 to 0.69 = needs verification
Below 0.50 = do not include

ROOM DETECTION — FIND EVERY SPACE:
List every single named and unnamed space on this blueprint page including:
- All labeled rooms (bedroom, kitchen etc)
- All utility spaces (mechanical, electrical)
- All transitional spaces (hallway, corridor, foyer, mudroom, entry, landing)
- All storage spaces (closet, storage, pantry)
- All outdoor spaces (patio, deck, garage)
- Any space with electrical symbols even if not explicitly labeled

For unlabeled spaces with electrical items:
- Name them by their apparent function
- Example: HALLWAY, STAIRCASE, ENTRY

Never leave a space with visible electrical symbols without a room assignment.

Also identify every room or area visible on this page.
For each room return an object in the rooms array with:
{
  room_name: label shown on blueprint or best descriptive guess,
  room_type: one of: living_room, bedroom, kitchen, bathroom, garage, dining_room, hallway, laundry, outdoor, basement, office, utility, other,
  approximate_width_ft: number or null,
  approximate_length_ft: number or null,
  approximate_sq_ft: number or null,
  confidence: number from 0.0 to 1.0
}

Return your complete response as a single JSON object with this exact shape (no markdown, no commentary):
{
  "electrical_items": [ ... array of electrical item objects as specified above ... ],
  "rooms": [ ... array of room objects ... ]
}

CRITICAL: Your entire response must be valid JSON and nothing else. No explanation text before or after. No markdown code fences. No apologies. Return a single JSON object with this exact shape: { "electrical_items": [...], "rooms": [...] }. If you encounter an error or cannot analyze the image, return { "electrical_items": [], "rooms": [] }. Never return plain text. Never return a bare array. Never return anything except the JSON object.`;

export async function POST(request: Request) {
  const rl = checkAiRouteRateLimit(request, "analyze-page");
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

  const supabaseAuth = await createSupabaseServerClient();
  const {
    data: { user: analyzeUser },
  } = await supabaseAuth.auth.getUser();
  if (!analyzeUser?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: {
    projectId?: string;
    pageNumber?: number;
    imageBase64?: string;
    /** Client should send image/png or image/jpeg to match payload. */
    imageMediaType?: string;
    /** Scan mode for api_usage cost row (quick | standard | deep). */
    scanType?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const pageNumber = body.pageNumber;
  const imageBase64 = body.imageBase64?.trim();

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

  const imageBuffer = Buffer.from(imageBase64, "base64");
  const decodedBytes = imageBuffer.length;
  const b64Compact = imageBase64.replace(/\s/g, "");
  const base64LooksValid = /^[A-Za-z0-9+/]+=*$/.test(b64Compact);
  console.log("[analyze-page] image received:", {
    pageNumber,
    projectId,
    decodedBytes,
    incomingBase64Length: imageBase64.length,
    base64CharsetOk: base64LooksValid,
    mediaTypeHeader: body.imageMediaType ?? "(missing)",
  });
  if (decodedBytes === 0) {
    console.warn("[analyze-page] decoded image is 0 bytes:", { pageNumber });
  }
  if (decodedBytes > MAX_INCOMING_IMAGE_BYTES) {
    return NextResponse.json(
      {
        error:
          "Page image too large — please try reducing scan resolution in settings",
      },
      { status: 400 },
    );
  }

  const rasterProbe = await imageBufferAppearsBlank(imageBuffer);
  console.log("[analyze-page] raster blank check:", {
    pageNumber,
    blank: rasterProbe.blank,
    width: rasterProbe.width,
    height: rasterProbe.height,
    sampleMean: rasterProbe.sampleMean,
    sampleStd: rasterProbe.sampleStd,
  });
  if (rasterProbe.blank) {
    return NextResponse.json(
      { error: "Page appears to be blank", blankPage: true },
      { status: 400 },
    );
  }

  const mediaTypeRaw = body.imageMediaType?.trim().toLowerCase();
  const claudeMediaType =
    mediaTypeRaw === "image/jpeg" ? "image/jpeg" : "image/png";
  console.log("[analyze-page] Claude image media:", {
    pageNumber,
    raw: mediaTypeRaw ?? null,
    sendingAs: claudeMediaType,
    isJpeg: claudeMediaType === "image/jpeg",
    isPng: claudeMediaType === "image/png",
  });

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
    /* Legend lookup is optional if table missing or misconfigured. */
  }

  const systemPromptUsed =
    legendAppendix.length > 0
      ? SYSTEM_PROMPT + legendAppendix
      : `${SYSTEM_PROMPT}

No project-specific symbol legend is on file for this project — use standard NEC and conventional blueprint electrical symbols.`;

  const anthropic = new Anthropic({ apiKey });

  const baseUserText =
    "Analyze this blueprint page. Return ONLY the JSON object with electrical_items and rooms arrays as specified.";

  const usageTotals = { inputTokens: 0, outputTokens: 0 };

  async function runClaudeTurn(
    userText: string,
    imageB64: string,
    media: "image/png" | "image/jpeg",
    callLabel: string,
  ): Promise<string> {
    console.log("[analyze-page] Claude API call:", {
      label: callLabel,
      pageNumber,
      projectId,
      model: MODEL,
      mediaType: media,
      imageBase64CharLength: imageB64.length,
    });
    const msg = await withClaudeOverloadRetries(() =>
      anthropic.messages.create({
        model: MODEL,
        max_tokens: 8192,
        stream: false,
        system: systemPromptUsed,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: media,
                  data: imageB64,
                },
              },
              {
                type: "text",
                text: userText,
              },
            ],
          },
        ],
      }),
    );
    return msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
  }

  let assistantText1: string;
  try {
    assistantText1 = await runClaudeTurn(
      baseUserText,
      imageBase64,
      claudeMediaType,
      "primary",
    );
  } catch (e) {
    console.error("[analyze-page] Claude primary call failed:", {
      pageNumber,
      projectId,
      error: e instanceof Error ? e.message : String(e),
    });
    const message =
      e instanceof Error ? e.message : "Claude API request failed.";
    const status =
      message === CLAUDE_OVERLOADED_USER_MESSAGE ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }

  console.log("[analyze-page] raw Claude response (first 500 chars):", {
    pageNumber,
    preview: assistantText1.slice(0, 500),
    totalChars: assistantText1.length,
  });

  let payload: { electrical_items: unknown[]; rooms: unknown[] } | null = null;
  let claudeTurnsUsed = 1;

  const cleanedText1 = stripMarkdownCodeFences(assistantText1);
  if (claudeTextLooksLikeJson(cleanedText1)) {
    payload = tryExtractAnalyzePayload(cleanedText1, {
      projectId,
      pageNumber,
      phase: "primary",
    });
  }
  if (payload) {
    console.log("[analyze-page] parsed payload (pre-strict-retry):", {
      pageNumber,
      electricalItemsCount: payload.electrical_items.length,
      roomsCount: payload.rooms.length,
    });
  }

  if (!payload) {
    claudeTurnsUsed = 2;
    console.error(
      `[analyze-page] Claude response not usable as JSON (project=${projectId} page=${pageNumber}). Full response:\n${assistantText1}`,
    );
    let assistantText2: string;
    try {
      assistantText2 = await runClaudeTurn(
        baseUserText + STRICT_JSON_USER_ADDENDUM,
        imageBase64,
        claudeMediaType,
        "strict-json-followup",
      );
    } catch (e) {
      console.error("[analyze-page] Claude strict-json call failed:", {
        pageNumber,
        error: e instanceof Error ? e.message : String(e),
      });
      const message =
        e instanceof Error ? e.message : "Claude API request failed.";
      const status =
        message === CLAUDE_OVERLOADED_USER_MESSAGE ? 503 : 502;
      return NextResponse.json({ error: message }, { status });
    }

    console.log("[analyze-page] raw Claude response 2 (first 500 chars):", {
      pageNumber,
      preview: assistantText2.slice(0, 500),
    });

    const cleanedText2 = stripMarkdownCodeFences(assistantText2);
    if (claudeTextLooksLikeJson(cleanedText2)) {
      payload = tryExtractAnalyzePayload(cleanedText2, {
        projectId,
        pageNumber,
        phase: "strict-json-followup",
      });
    }
    if (!payload) {
      console.error(
        `[analyze-page] Second Claude attempt still not usable JSON (project=${projectId} page=${pageNumber}). Full response:\n${assistantText2}`,
      );
      await recordAnalyzePageApiUsage({
        projectId,
        pageNumber,
        scanType: body.scanType,
        claudeTurns: claudeTurnsUsed,
        inputTokens: usageTotals.inputTokens,
        outputTokens: usageTotals.outputTokens,
        model: MODEL,
      });
      return NextResponse.json({
        items: [],
        rooms: [],
        persisted: false,
        pageAnalysisWarning: `Page ${pageNumber} returned no electrical items — please verify manually`,
      });
    }
  }

  let rows = materializeElectricalItemRows(projectId, pageNumber, payload);
  let roomRows = materializeRoomRows(projectId, pageNumber, payload);

  console.log("[analyze-page] materialized rows (after normalize):", {
    pageNumber,
    itemRows: rows.length,
    roomRows: roomRows.length,
    rawPayloadItems: payload.electrical_items.length,
    imageBytes: decodedBytes,
    claudeTurnsUsed,
  });

  if (rows.length === 0 && !rasterProbe.blank) {
    const aggressiveUser = aggressiveEmptyRetryUserText(pageNumber);
    console.log("[analyze-page] starting aggressive empty-items retry:", {
      pageNumber,
    });
    let retryText: string;
    try {
      retryText = await runClaudeTurn(
        aggressiveUser,
        imageBase64,
        claudeMediaType,
        "aggressive-retry",
      );
      claudeTurnsUsed += 1;
    } catch (e) {
      console.error("[analyze-page] aggressive retry Claude failed:", {
        pageNumber,
        error: e instanceof Error ? e.message : String(e),
      });
      const message =
        e instanceof Error ? e.message : "Claude API request failed.";
      const status =
        message === CLAUDE_OVERLOADED_USER_MESSAGE ? 503 : 502;
      return NextResponse.json({ error: message }, { status });
    }

    console.log("[analyze-page] aggressive retry raw (first 500 chars):", {
      pageNumber,
      preview: retryText.slice(0, 500),
    });

    const cleanedRetryText = stripMarkdownCodeFences(retryText);
    let retryPayload: ParsedAnalyzePayload | null = claudeTextLooksLikeJson(
      cleanedRetryText,
    )
      ? tryExtractAnalyzePayload(cleanedRetryText, {
          projectId,
          pageNumber,
          phase: "aggressive-retry",
        })
      : null;

    if (!retryPayload) {
      // 4th call removed — stays within 180s maxDuration budget.
      console.log("[analyze-page] aggressive retry failed JSON parse, using fallback:", { pageNumber });
    }

    if (retryPayload) {
      payload = retryPayload;
      rows = materializeElectricalItemRows(projectId, pageNumber, retryPayload);
      roomRows = materializeRoomRows(projectId, pageNumber, retryPayload);
    }

    console.log(
      "[analyze-page] Page",
      pageNumber + " (aggressive retry, same image):",
      "items found:",
      rows.length,
      "rooms:",
      roomRows.length,
      "image size:",
      decodedBytes,
      "attempt:",
      claudeTurnsUsed,
    );

    if (rows.length === 0) {
      rows = [fallbackUnclearPlanNoteRow(projectId, pageNumber)];
      console.log(
        "[analyze-page] Page",
        pageNumber + ":",
        "inserting fallback plan_note (still no items after retry)",
      );
    }
  }

  if (rows.length === 0 && roomRows.length === 0) {
    await recordAnalyzePageApiUsage({
      projectId,
      pageNumber,
      scanType: body.scanType,
      claudeTurns: claudeTurnsUsed,
      inputTokens: usageTotals.inputTokens,
      outputTokens: usageTotals.outputTokens,
      model: MODEL,
    });
    return NextResponse.json({
      items: [],
      rooms: [],
      message: "No electrical items or rooms met the confidence threshold.",
    });
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
    console.error("[analyze-page] detected_rooms delete failed:", {
      pageNumber,
      message: delRoomErr.message,
    });
    return NextResponse.json(
      {
        error: delRoomErr.message,
        hint: "Ensure detected_rooms table exists.",
      },
      { status: 500 },
    );
  }

  const { error: delItemErr } = await supabase
    .from("electrical_items")
    .delete()
    .eq("project_id", projectId)
    .eq("page_number", pageNumber);

  if (delItemErr) {
    console.error("[analyze-page] electrical_items delete failed:", {
      pageNumber,
      message: delItemErr.message,
    });
    return NextResponse.json(
      {
        error: delItemErr.message,
        hint: "Ensure electrical_items table exists.",
      },
      { status: 500 },
    );
  }

  let insertedItems: unknown[] = [];
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from("electrical_items")
      .insert(rows)
      .select();

    if (error) {
      console.error("[analyze-page] electrical_items insert failed:", {
        pageNumber,
        message: error.message,
      });
      return NextResponse.json(
        {
          error: error.message,
          hint: "Check electrical_items table and RLS/service role.",
        },
        { status: 500 },
      );
    }
    insertedItems = data ?? [];
  }

  let insertedRooms: unknown[] = [];
  if (roomRows.length > 0) {
    const { data: roomData, error: roomErr } = await supabase
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
    insertedRooms = roomData ?? [];
  }

  try {
    const scanIdx = await nextSavedScanIndex(supabase, projectId);
    const scanName = formatAutoScanName(scanIdx);
    const { error: scanErr } = await supabase.from("saved_scans").insert({
      project_id: projectId,
      page_number: pageNumber,
      scan_name: scanName,
      scan_date: new Date().toISOString(),
      items_snapshot: insertedItems,
      rooms_snapshot: insertedRooms,
      total_items: rows.length,
      notes: null,
      scan_mode:
        typeof body.scanType === "string" && body.scanType.trim()
          ? body.scanType.trim()
          : null,
    });
    if (scanErr) {
      console.error(
        "[analyze-page] saved_scans insert failed:",
        scanErr.message,
        scanErr.details,
        scanErr.hint,
        scanErr.code,
      );
    }
  } catch (e) {
    console.error("[analyze-page] saved_scans insert exception:", e);
  }

  await recordAnalyzePageApiUsage({
    projectId,
    pageNumber,
    scanType: body.scanType,
    claudeTurns: claudeTurnsUsed,
    inputTokens: usageTotals.inputTokens,
    outputTokens: usageTotals.outputTokens,
    model: MODEL,
  });

  return NextResponse.json({
    items: insertedItems,
    rooms: insertedRooms,
    persisted: true,
    message:
      rows.length === 0
        ? "No electrical items met the confidence threshold."
        : undefined,
  });
}
