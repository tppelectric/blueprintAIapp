import type { AIAction, AIResponse } from "@/lib/ai-assistant-context";

const JSON_BLOB_START = /^\s*[\[{]/;

function stripCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  }
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }
  return t.trim();
}

/** Return the first balanced `{...}` substring, respecting strings and escapes. */
export function extractFirstJsonObject(raw: string): string | null {
  const text = raw.trim();
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function coercePlainMessage(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    if (JSON_BLOB_START.test(t)) {
      try {
        const nested = JSON.parse(t) as unknown;
        if (nested && typeof nested === "object" && !Array.isArray(nested)) {
          const inner = coercePlainMessage(
            (nested as Record<string, unknown>).message,
          );
          if (inner) return inner;
        }
      } catch {
        const embedded = extractFirstJsonObject(t);
        if (embedded) {
          try {
            const nested = JSON.parse(embedded) as unknown;
            if (nested && typeof nested === "object" && !Array.isArray(nested)) {
              const inner = coercePlainMessage(
                (nested as Record<string, unknown>).message,
              );
              if (inner) return inner;
            }
          } catch {
            /* fall through */
          }
        }
      }
    }
    return t;
  }
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function parseActions(raw: unknown): AIResponse["actions"] {
  if (!Array.isArray(raw)) return undefined;
  const actions = raw
    .map((a) => {
      if (!a || typeof a !== "object") return null;
      const ar = a as Record<string, unknown>;
      const type = typeof ar.type === "string" ? ar.type : "";
      const label = typeof ar.label === "string" ? ar.label : "";
      if (!type || !label) return null;
      const href = typeof ar.href === "string" ? ar.href : undefined;
      const data =
        ar.data && typeof ar.data === "object" && !Array.isArray(ar.data)
          ? (ar.data as Record<string, unknown>)
          : undefined;
      return { type, label, href, data };
    })
    .filter(Boolean) as AIAction[];
  return actions.length > 0 ? actions : undefined;
}

function responseFromObject(o: Record<string, unknown>): AIResponse | null {
  const message = coercePlainMessage(o.message);
  if (!message) return null;
  return { message, actions: parseActions(o.actions) };
}

function tryParseJsonObject(candidate: string): AIResponse | null {
  try {
    const j = JSON.parse(candidate) as unknown;
    if (!j || typeof j !== "object" || Array.isArray(j)) return null;
    return responseFromObject(j as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Remove JSON blobs and code fences from prose fallback text. */
export function proseFallback(raw: string): string {
  let t = raw.trim();
  t = t.replace(/```(?:json)?[\s\S]*?```/gi, " ").trim();
  const embedded = extractFirstJsonObject(t);
  if (embedded) {
    t = t.replace(embedded, " ").trim();
  }
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

function looksLikeJsonBlob(text: string): boolean {
  return JSON_BLOB_START.test(text.trim());
}

export function parseAssistantJson(raw: string): AIResponse {
  const trimmed = raw.trim();
  if (!trimmed) return { message: "No response." };

  const candidates = new Set<string>();
  candidates.add(trimmed);
  candidates.add(stripCodeFences(trimmed));
  const embedded = extractFirstJsonObject(trimmed);
  if (embedded) candidates.add(embedded);

  for (const candidate of candidates) {
    const parsed = tryParseJsonObject(candidate);
    if (parsed) return parsed;
  }

  const cleaned = proseFallback(trimmed);
  if (cleaned && !looksLikeJsonBlob(cleaned)) {
    return { message: cleaned };
  }

  return {
    message: "I couldn't format that response. Please try again.",
  };
}

/** Client guard: unwrap JSON-ish assistant content before display. */
export function sanitizeAssistantDisplayMessage(text: string): string {
  const t = text.trim();
  if (!t) return text;
  if (!looksLikeJsonBlob(t)) return text;

  const direct = tryParseJsonObject(t);
  if (direct?.message) return direct.message;

  const fenced = stripCodeFences(t);
  if (fenced !== t) {
    const fromFence = tryParseJsonObject(fenced);
    if (fromFence?.message) return fromFence.message;
  }

  const embedded = extractFirstJsonObject(t);
  if (embedded) {
    const fromEmbedded = tryParseJsonObject(embedded);
    if (fromEmbedded?.message) return fromEmbedded.message;
  }

  const cleaned = proseFallback(t);
  if (cleaned && !looksLikeJsonBlob(cleaned)) return cleaned;

  return text;
}
