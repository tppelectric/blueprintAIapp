import {
  extractJsonObjectFromModelText,
  sliceBalancedJsonObject,
} from "@/lib/project-describer-types";

/** Strip common markdown code fences Claude adds despite instructions. */
export function stripMarkdownCodeFences(text: string): string {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

const DAILY_LOG_START_PATTERNS: RegExp[] = [
  /\{\s*"job_name"\s*:/,
  /\{\s*"work_completed"\s*:/,
  /\{\s*"materials_used"\s*:/,
  /\{\s*"employees_onsite"\s*:/,
  /\{\s*"check_in"\s*:/,
];

/**
 * Extract a JSON object string for the daily log schema from Claude output.
 * Tries fence stripping, generic extractor, and key-anchored balanced slices.
 */
export function extractDailyLogJsonString(rawText: string): string | null {
  const bodies: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    bodies.push(t);
  };
  push(stripMarkdownCodeFences(rawText));
  push(rawText.trim());

  for (const body of bodies) {
    const ext = extractJsonObjectFromModelText(body);
    if (ext) return ext;

    for (const re of DAILY_LOG_START_PATTERNS) {
      const m = body.search(re);
      if (m !== -1) {
        const slice = sliceBalancedJsonObject(body, m);
        if (slice) return slice;
      }
    }

    const firstBrace = body.indexOf("{");
    if (firstBrace !== -1) {
      const slice = sliceBalancedJsonObject(body, firstBrace);
      if (slice) return slice;
    }

    if (body.startsWith("{")) {
      const slice = sliceBalancedJsonObject(body, 0);
      if (slice) return slice;
    }
  }

  return null;
}
