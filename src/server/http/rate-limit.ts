/**
 * Rate limiting for expensive endpoints.
 *
 * The goal is abuse prevention, NOT a security boundary: the real limits on
 * what a user may consume are the daily plan quotas in
 * `@/server/services/usage`, which are enforced in Firestore transactions and
 * survive a restart. This limiter stops short bursts and runaway clients.
 *
 * Implementation notes:
 *   - In-memory, so it is per-instance. On a multi-instance deployment each
 *     instance limits independently, which is acceptable for burst protection.
 *     A distributed limit would need Redis or Firestore, and would then share
 *     the quota system's transaction cost.
 *   - A fixed window is used rather than a sliding one: it is simple, has
 *     bounded memory, and is adequate for burst control.
 *   - Entries are pruned lazily so an attacker cannot exhaust memory by
 *     cycling through many identifiers.
 */
import "server-only";

import { ApiError } from "@/server/http/errors";

/** A single rate-limit rule. */
export interface RateLimitRule {
  /** Maximum requests permitted within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Rate-limit counters, keyed by `${bucket}:${identifier}`. */
const counters = new Map<string, { count: number; resetAt: number }>();

/** Hard cap on tracked keys, so memory cannot grow without bound. */
const MAX_TRACKED_KEYS = 10_000;

/** Removes expired entries. Called opportunistically, not on a timer. */
function prune(now: number): void {
  for (const [key, entry] of counters) {
    if (entry.resetAt <= now) counters.delete(key);
  }

  // If still oversized after pruning, drop the oldest half. This only happens
  // under a distributed flood, where shedding some counters is preferable to
  // unbounded growth.
  if (counters.size > MAX_TRACKED_KEYS) {
    const excess = counters.size - MAX_TRACKED_KEYS;
    let removed = 0;
    for (const key of counters.keys()) {
      counters.delete(key);
      if (++removed >= excess) break;
    }
  }
}

/** Result of a rate-limit check. */
export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Seconds until the window resets. */
  retryAfterSeconds: number;
}

/**
 * Consumes one token for an identifier.
 *
 * @param bucket     Logical group, e.g. "generate". Keeps separate endpoints
 *                   from interfering with each other.
 * @param identifier Usually the authenticated uid; falls back to an IP.
 * @param rule       Limit and window for this bucket.
 */
export function checkRateLimit(
  bucket: string,
  identifier: string,
  rule: RateLimitRule,
): RateLimitResult {
  const now = Date.now();
  const key = `${bucket}:${identifier}`;

  // Prune occasionally rather than on every call, to keep the hot path cheap.
  if (counters.size > 1_000) prune(now);

  const existing = counters.get(key);

  if (!existing || existing.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + rule.windowMs });
    return {
      allowed: true,
      remaining: rule.limit - 1,
      retryAfterSeconds: Math.ceil(rule.windowMs / 1000),
    };
  }

  if (existing.count >= rule.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      ),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: rule.limit - existing.count,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/**
 * Enforces a rate limit, throwing when exceeded.
 *
 * @throws {ApiError} `rate_limited` with an Albanian message.
 */
export function enforceRateLimit(
  bucket: string,
  identifier: string,
  rule: RateLimitRule,
): RateLimitResult {
  const result = checkRateLimit(bucket, identifier, rule);

  if (!result.allowed) {
    throw new ApiError(
      "rate_limited",
      `Shumë kërkesa. Provo përsëri pas ${result.retryAfterSeconds} sekondash.`,
    );
  }

  return result;
}

/** Rate-limit rules per bucket. */
export const RATE_LIMITS = {
  /**
   * Generation calls a paid model, so bursts are the most expensive abuse.
   * 10 per minute is far above normal study use while still bounding a runaway
   * client. The daily plan quota remains the real ceiling.
   */
  generate: { limit: 10, windowMs: 60_000 },
  /** Regeneration is equally expensive. */
  regenerate: { limit: 10, windowMs: 60_000 },
  /** History reads are cheap, but should still not be hammered. */
  history: { limit: 60, windowMs: 60_000 },
  /** Checkout sessions are rare; a low limit prevents enumeration. */
  checkout: { limit: 5, windowMs: 60_000 },
  /**
   * Admin actions. Higher than checkout because legitimate admin work is
   * repetitive — fixing several accounts in a row, or correcting a batch of
   * plans — and a limit that blocks real use just gets worked around.
   *
   * Still bounded: it caps the damage if an admin token is ever stolen, which is
   * the reason to limit a trusted caller at all. The 5/minute this used to share
   * with checkout was low enough that an admin fixing four accounts hit it.
   */
  admin: { limit: 60, windowMs: 60_000 },
  /**
   * Post-checkout verification. Each call reads from Whop, so it is bounded —
   * but generously, because it is the call that makes activation feel instant
   * and the client retries it a few times while the purchase settles.
   */
  verify: { limit: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/** Identifies the caller for rate-limiting purposes. */
export function rateLimitIdentifier(
  uid: string | null,
  request: { headers: Headers },
): string {
  if (uid) return `uid:${uid}`;

  // Fall back to the forwarded IP when the caller is unauthenticated. Only the
  // first hop is trusted; the header is client-controllable in general, which
  // is acceptable because authenticated calls key on the uid instead.
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip ? `ip:${ip}` : "ip:unknown";
}

/** Clears all counters. Exposed for tests only. */
export function resetRateLimits(): void {
  counters.clear();
}
