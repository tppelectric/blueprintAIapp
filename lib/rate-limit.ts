/**
 * Simple in-memory rate limiting for API routes (per-process).
 * Not suitable for multi-instance scale-out without a shared store.
 */

type Bucket = {
  count: number;
  windowStart: number;
};

const store = new Map<string, Bucket>();

const PRUNE_INTERVAL = 100;
let pruneTick = 0;

function pruneExpired(now: number, windowMs: number): void {
  pruneTick += 1;
  if (pruneTick % PRUNE_INTERVAL !== 0) return;
  const cutoff = now - windowMs * 2;
  for (const [k, v] of store) {
    if (v.windowStart < cutoff) store.delete(k);
  }
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Fixed window: at most `maxRequests` hits per `windowMs` per key.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  pruneExpired(now, windowMs);

  let b = store.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  b.count += 1;
  if (b.count > maxRequests) {
    const msLeft = windowMs - (now - b.windowStart);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(msLeft / 1000)),
    };
  }
  return { allowed: true };
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  return "unknown";
}

const AI_DEFAULT_MAX = 10;
const AI_DEFAULT_WINDOW_MS = 60_000;

/**
 * Rate limit expensive AI routes: 10 req/min per IP per route id.
 */
export function checkAiRouteRateLimit(
  request: Request,
  routeId: string,
  maxPerMinute: number = AI_DEFAULT_MAX,
  windowMs: number = AI_DEFAULT_WINDOW_MS,
): RateLimitResult {
  const ip = getClientIp(request);
  return checkRateLimit(`ai:${routeId}:${ip}`, maxPerMinute, windowMs);
}
