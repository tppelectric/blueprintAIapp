/** Shared retry helpers for Claude overload (529) and OpenAI rate limits (429). */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const CLAUDE_OVERLOADED_USER_MESSAGE =
  "Claude AI is currently busy.\nPlease try again in a minute.";

export const OPENAI_RATE_LIMIT_USER_MESSAGE =
  "The verification service is temporarily rate-limited. Please try again in a minute.";

function recordErrorShape(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== "object") return null;
  return error as Record<string, unknown>;
}

/** Claude 529 overloaded / overloaded_error from the Anthropic API. */
export function isAnthropicOverloadedError(error: unknown): boolean {
  const o = recordErrorShape(error);
  if (!o) return false;
  if (o.status === 529) return true;
  const errBody = o.error;
  if (errBody && typeof errBody === "object") {
    const t = (errBody as Record<string, unknown>).type;
    if (t === "overloaded_error") return true;
  }
  const msg = String(o.message ?? "");
  if (/529/.test(msg) && /overloaded/i.test(msg)) return true;
  return false;
}

/** OpenAI 429 / rate_limit_exceeded. */
export function isOpenAIRateLimitError(error: unknown): boolean {
  const o = recordErrorShape(error);
  if (!o) return false;
  if (o.status === 429) return true;
  const code = (o as { code?: string }).code;
  if (code === "rate_limit_exceeded") return true;
  const msg = String(o.message ?? "");
  if (/429/.test(msg) && /rate/i.test(msg)) return true;
  return false;
}

/**
 * Attempt 1 immediately; on overload wait 10s, retry; on overload wait 20s, retry once more.
 * After 3 failures on overload, throws Error with {@link CLAUDE_OVERLOADED_USER_MESSAGE}.
 */
export async function withClaudeOverloadRetries<T>(
  call: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt === 1) await sleep(10_000);
    if (attempt === 2) await sleep(20_000);
    try {
      return await call();
    } catch (e) {
      lastErr = e;
      if (!isAnthropicOverloadedError(e)) throw e;
      if (attempt === 2) throw new Error(CLAUDE_OVERLOADED_USER_MESSAGE);
    }
  }
  throw lastErr;
}

/**
 * Same backoff pattern for OpenAI 429 rate limits.
 */
export async function withOpenAIRateLimitRetries<T>(
  call: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt === 1) await sleep(10_000);
    if (attempt === 2) await sleep(20_000);
    try {
      return await call();
    } catch (e) {
      lastErr = e;
      if (!isOpenAIRateLimitError(e)) throw e;
      if (attempt === 2) throw new Error(OPENAI_RATE_LIMIT_USER_MESSAGE);
    }
  }
  throw lastErr;
}
