import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
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

export const maxDuration = 300;

const MODEL = "claude-sonnet-4-6";

function inferVisionImageMediaTypeFromBase64(
  base64: string,
): "image/png" | "image/jpeg" {
  try {
    const buf = Buffer.from(base64, "base64");
    if (
      buf.length >= 3 &&
      buf[0] === 0xff &&
      buf[1] === 0xd8 &&
      buf[2] === 0xff
    ) {
      return "image/jpeg";
    }
  } catch {
    /* default PNG */
  }
  return "image/png";
}

const LEGEND_USER_PROMPT = `You are scanning this blueprint for an ELECTRICAL legend or symbol key ONLY.

INCLUDE these symbols:
- Electrical outlets and receptacles
- Lighting fixtures of all types
- Switches (single pole, 3-way, dimmer)
- Electrical panels and subpanels
- Circuit breakers and disconnects
- Wire and conduit callouts
- Low voltage devices (data, phone, coax)
- Fire alarm and smoke/CO detectors
- EV charger symbols
- Motor and equipment connections
- Any symbol labeled with electrical terms

IGNORE and DO NOT include:
- Plumbing symbols (pipes, fixtures, valves)
- HVAC symbols (ducts, diffusers, equipment)
- Structural symbols (beams, columns, walls)
- Architectural symbols (doors, windows)
- Civil or site symbols
- Mechanical equipment unrelated to electrical

PLAN NOTES — CAPTURE THESE SEPARATELY:
Also identify any plan notes or general notes and categorize them as:

1. ELECTRICAL NOTES (directly affect electrical work):
   - Wire gauge requirements
   - Circuit requirements
   - Panel specifications
   - NEC code references
   - Electrical inspection notes
   - Load requirements
   - Grounding requirements

2. GENERAL NOTES (affect all trades):
   - Permit requirements
   - Inspection requirements
   - Safety requirements
   - Material standards
   - Code edition references

3. OTHER TRADE NOTES (note but do not include in electrical takeoff):
   - Plumbing notes
   - HVAC notes
   - Structural notes
   - Architectural notes

Return your response as JSON with this exact shape:
{
  "legend_found": true or false,
  "legend_page": <page number>,
  "symbols": [electrical symbols only — each: { "symbol_description": "string", "symbol_category": "fixture or panel or wiring or low_voltage or outlet or switch or other", "confidence": 0.0 to 1.0 }],
  "electrical_notes": [each: string OR { "note": "string" }],
  "general_notes": [each: string OR { "note": "string" }],
  "other_trade_notes": [each: { "trade_type": "e.g. Plumbing or HVAC", "note": "string" } OR a string]
}

If no electrical legend or relevant notes exist on this page, return:
{ "legend_found": false }

Return ONLY valid JSON, no markdown or commentary.`;

const SYMBOL_CATS = new Set([
  "fixture",
  "panel",
  "wiring",
  "low_voltage",
  "outlet",
  "receptacle",
  "switch",
  "breaker",
  "disconnect",
  "conduit",
  "fire_alarm",
  "ev_charger",
  "motor",
  "equipment",
  "data",
  "telecom",
  "smoke",
  "carbon_monoxide",
  "lighting",
  "other",
]);

function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = (fence ? fence[1] : trimmed).trim();
  const parsed = JSON.parse(payload) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Claude did not return a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function normalizeCategory(raw: unknown): string {
  let c = String(raw ?? "other")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  if (c === "low-voltage") c = "low_voltage";
  if (c === "receptacle" || c === "duplex") c = "outlet";
  if (c === "lighting" || c === "light") c = "fixture";
  if (!SYMBOL_CATS.has(c)) c = "other";
  return c;
}

function parseNoteText(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    return String(o.note ?? o.text ?? o.description ?? "").trim();
  }
  return "";
}

function parseOtherTradeNote(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const note = String(o.note ?? o.text ?? "").trim();
    const trade = String(o.trade_type ?? o.trade ?? o.tradeType ?? "").trim();
    if (!note) return "";
    if (trade) return `[${trade}] ${note}`;
    return note;
  }
  return "";
}

type LegendRow = {
  symbol_description: string;
  symbol_category: string;
  confidence: number;
  source_page: number;
  note_category: "symbol" | "electrical_note" | "general_note" | "other_trade_note";
};

type LegendPageResult = {
  page: number;
  found: boolean;
  rows: LegendRow[];
};

function parseLegendResponse(
  pageNumber: number,
  obj: Record<string, unknown>,
): LegendPageResult {
  const found = Boolean(obj.legend_found);
  if (!found) {
    return { page: pageNumber, found: false, rows: [] };
  }

  const rows: LegendRow[] = [];

  const symbols = obj.symbols;
  if (Array.isArray(symbols)) {
    for (const entry of symbols) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const desc = String(e.symbol_description ?? "").trim();
      if (!desc) continue;
      let conf = Number(e.confidence);
      if (!Number.isFinite(conf)) conf = 0.75;
      conf = Math.min(1, Math.max(0, conf));
      rows.push({
        symbol_description: desc,
        symbol_category: normalizeCategory(e.symbol_category),
        confidence: conf,
        source_page: pageNumber,
        note_category: "symbol",
      });
    }
  }

  const electrical = obj.electrical_notes;
  if (Array.isArray(electrical)) {
    for (const raw of electrical) {
      const desc = parseNoteText(raw);
      if (!desc) continue;
      rows.push({
        symbol_description: desc,
        symbol_category: "electrical_note",
        confidence: 0.85,
        source_page: pageNumber,
        note_category: "electrical_note",
      });
    }
  }

  const general = obj.general_notes;
  if (Array.isArray(general)) {
    for (const raw of general) {
      const desc = parseNoteText(raw);
      if (!desc) continue;
      rows.push({
        symbol_description: desc,
        symbol_category: "general_note",
        confidence: 0.8,
        source_page: pageNumber,
        note_category: "general_note",
      });
    }
  }

  const other = obj.other_trade_notes;
  if (Array.isArray(other)) {
    for (const raw of other) {
      const desc = parseOtherTradeNote(raw);
      if (!desc) continue;
      rows.push({
        symbol_description: desc,
        symbol_category: "other_trade_note",
        confidence: 0.75,
        source_page: pageNumber,
        note_category: "other_trade_note",
      });
    }
  }

  return {
    page: pageNumber,
    found: rows.length > 0,
    rows,
  };
}

export async function POST(request: Request) {
  const rl = checkAiRouteRateLimit(request, "detect-legend");
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

  let body: { projectId?: string; project_id?: string; pageImages?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectId = (body.projectId ?? body.project_id)?.trim();
  const pageImages = body.pageImages;

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!projectId || !uuidRe.test(projectId)) {
    return NextResponse.json({ error: "Invalid projectId." }, { status: 400 });
  }
  if (!Array.isArray(pageImages) || pageImages.length === 0) {
    return NextResponse.json(
      { error: "pageImages must be a non-empty array of base64 PNG strings." },
      { status: 400 },
    );
  }

  for (let i = 0; i < pageImages.length; i++) {
    const s = pageImages[i];
    if (typeof s !== "string" || s.length < 50) {
      return NextResponse.json(
        { error: `pageImages[${i}] is missing or too short.` },
        { status: 400 },
      );
    }
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

  const { data: projectRow, error: projErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }
  if (!projectRow) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const { error: delErr } = await supabase
    .from("project_symbols")
    .delete()
    .eq("project_id", projectId);

  if (delErr) {
    return NextResponse.json(
      {
        error: delErr.message,
        hint: "Ensure project_symbols table exists (run supabase/project_symbols.sql).",
      },
      { status: 500 },
    );
  }

  const anthropic = new Anthropic({ apiKey });
  const allRows: LegendRow[] = [];
  let primaryLegendPage: number | null = null;

  for (let i = 0; i < pageImages.length; i++) {
    const pageNumber = i + 1;
    const imageBase64 = pageImages[i]!;
    const pageMediaType = inferVisionImageMediaTypeFromBase64(imageBase64);

    let assistantText: string;
    try {
      const msg = await withClaudeOverloadRetries(() =>
        anthropic.messages.create({
          model: MODEL,
          max_tokens: 8192,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: pageMediaType,
                    data: imageBase64,
                  },
                },
                {
                  type: "text",
                  text: `${LEGEND_USER_PROMPT}\n\nThis is blueprint page ${pageNumber} (1-based index in the uploaded set). Use this number for legend_page in your JSON when legend_found is true.`,
                },
              ],
            },
          ],
        }),
      );

      assistantText = msg.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("\n")
        .trim();

      const usage = anthropicUsageFromMessage(msg);
      await recordApiUsage({
        route: "detect-legend",
        model: MODEL,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        projectId,
        pageNumber,
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Claude API request failed.";
      const status =
        message === CLAUDE_OVERLOADED_USER_MESSAGE ? 503 : 502;
      return NextResponse.json({ error: message }, { status });
    }

    let obj: Record<string, unknown>;
    try {
      obj = extractJsonObject(assistantText);
    } catch (e) {
      return NextResponse.json(
        {
          error:
            e instanceof Error
              ? e.message
              : "Could not parse Claude legend response.",
          page: pageNumber,
          raw: assistantText.slice(0, 1500),
        },
        { status: 422 },
      );
    }

    const parsed = parseLegendResponse(pageNumber, obj);
    if (parsed.found && parsed.rows.length > 0) {
      if (primaryLegendPage === null) {
        const lp = obj.legend_page;
        const n = typeof lp === "number" ? lp : Number(lp);
        primaryLegendPage =
          Number.isFinite(n) && n >= 1 ? Math.floor(n) : pageNumber;
      }
      allRows.push(...parsed.rows);
    }
  }

  if (allRows.length > 0) {
    const insertPayload = allRows.map((r) => ({
      project_id: projectId,
      symbol_description: r.symbol_description,
      symbol_category: r.symbol_category,
      confidence: r.confidence,
      source_page: r.source_page,
      user_confirmed: false,
      note_category: r.note_category,
    }));

    const CHUNK = 50;
    const insertedAll: Record<string, unknown>[] = [];
    for (let off = 0; off < insertPayload.length; off += CHUNK) {
      const chunk = insertPayload.slice(off, off + CHUNK);
      const { data: chunkData, error: insErr } = await supabase
        .from("project_symbols")
        .insert(chunk)
        .select();

      if (insErr) {
        console.error(
          "[detect-legend] project_symbols insert failed at offset",
          off,
          "message:",
          insErr.message,
          "details:",
          insErr.details,
          "hint:",
          insErr.hint,
          "code:",
          insErr.code,
        );
        return NextResponse.json(
          {
            error: insErr.message,
            hint:
              "If the error mentions note_category, run supabase/project_symbols_note_category.sql.",
          },
          { status: 500 },
        );
      }
      if (chunkData?.length) insertedAll.push(...chunkData);
    }

    const symbolOnly = allRows.filter((r) => r.note_category === "symbol")
      .length;
    const noteCount = allRows.length - symbolOnly;

    return NextResponse.json({
      ok: true,
      primaryLegendPage,
      symbolCount: symbolOnly,
      noteCount,
      totalRowCount: insertedAll.length,
      symbols: insertedAll,
    });
  }

  return NextResponse.json({
    ok: true,
    primaryLegendPage: null,
    symbolCount: 0,
    noteCount: 0,
    totalRowCount: 0,
    symbols: [],
  });
}
