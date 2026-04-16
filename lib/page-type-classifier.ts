/**
 * Lightweight page type pre-classifier.
 * Runs a single fast Claude call to determine if a page is:
 *   "floor_plan"  — has spatial symbols, rooms, device layouts
 *   "spec_sheet"  — panel schedules, tables, text-heavy, no spatial layout
 *   "legend"      — symbol legend / keynote sheet
 *   "unknown"     — cannot determine (treat as floor_plan)
 */

export type PageType = "floor_plan" | "spec_sheet" | "legend" | "unknown";

export type ClassifyPageResult = {
  pageType: PageType;
  confidence: number;
  reason: string;
};

const CLASSIFY_SYSTEM = `You are an electrical blueprint page classifier. 
Your only job is to classify what type of page this is.

Respond with ONLY a JSON object, no markdown, no explanation:
{
  "page_type": "floor_plan" | "spec_sheet" | "legend" | "unknown",
  "confidence": 0.0-1.0,
  "reason": "one sentence explanation"
}

Definitions:
- floor_plan: Shows rooms, walls, spatial layout, electrical symbols placed in rooms. Has a floor plan drawing.
- spec_sheet: Panel schedules, circuit tables, load calculations, written specifications, riser diagrams. Mostly text and tables, no spatial floor plan.
- legend: Symbol key, keynote schedule, abbreviation list. Shows symbols with their meanings.
- unknown: Cannot determine.`;

export async function classifyPageType(
  imageBase64: string,
  mediaType: "image/png" | "image/jpeg",
  apiKey: string,
): Promise<ClassifyPageResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: CLASSIFY_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            { type: "text", text: "Classify this blueprint page." },
          ],
        },
      ],
    });

    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(text) as {
      page_type?: string;
      confidence?: number;
      reason?: string;
    };

    const validTypes: PageType[] = ["floor_plan", "spec_sheet", "legend", "unknown"];
    const pageType = validTypes.includes(parsed.page_type as PageType)
      ? (parsed.page_type as PageType)
      : "unknown";

    return {
      pageType,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    };
  } catch {
    return { pageType: "unknown", confidence: 0, reason: "Classification failed" };
  }
}
