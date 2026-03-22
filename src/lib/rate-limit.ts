/**
 * PostgreSQL-based rate limiting via Supabase RPC.
 *
 * Uses the `check_rate_limit` function created in migration 004.
 * Each route passes a key (e.g., "subscribe:{ip}") with a max request
 * count and window duration. The DB handles atomic check-and-increment.
 *
 * Fallback: When Supabase is unavailable, an in-memory rate limiter
 * activates so the system fails closed (blocks excessive requests)
 * rather than failing open (allowing unlimited requests).
 *
 * Usage:
 *   const { limited } = await checkRateLimit(supabase, `subscribe:${ip}`, 5, 60);
 *   if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ── In-memory fallback when Supabase is unavailable ─────────────────
// LIMITATION: On serverless platforms (Vercel), each isolate has its own
// in-memory Map. Requests distributed across N warm instances get N
// independent rate limit counters, so the effective limit is
// MEMORY_MAX_REQUESTS * N. The conservative limit (3) and short window
// mitigate this, but for guaranteed rate limiting under Supabase outage,
// consider Vercel KV or Upstash Redis as a more durable fallback.
const memoryStore = new Map<string, number[]>();
const MEMORY_WINDOW_MS = 60_000; // 1 minute
const MEMORY_MAX_REQUESTS = 3; // conservative — mirrors tightest DB limit (3/hr for magic links)
const MEMORY_MAX_KEYS = 10_000; // cap to prevent unbounded growth
let lastCleanup = Date.now();

/**
 * In-memory rate limiter used when the primary Supabase RPC is unreachable.
 * Returns true if the request should be blocked (rate limited).
 */
function memoryRateLimit(key: string): boolean {
  const now = Date.now();

  // Periodic cleanup: evict expired keys every 60s or when map exceeds cap
  if (now - lastCleanup > MEMORY_WINDOW_MS || memoryStore.size > MEMORY_MAX_KEYS) {
    for (const [k, timestamps] of memoryStore) {
      const valid = timestamps.filter((t) => now - t < MEMORY_WINDOW_MS);
      if (valid.length === 0) {
        memoryStore.delete(k);
      } else {
        memoryStore.set(k, valid);
      }
    }
    lastCleanup = now;
  }

  const timestamps = memoryStore.get(key) || [];
  const valid = timestamps.filter((t) => now - t < MEMORY_WINDOW_MS);
  if (valid.length >= MEMORY_MAX_REQUESTS) return true;
  valid.push(now);
  memoryStore.set(key, valid);
  return false;
}

/**
 * Check if a request should be rate limited.
 * @param supabase - Admin Supabase client
 * @param key - Rate limit key (e.g., "subscribe:1.2.3.4")
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowSeconds - Window duration in seconds
 * @returns { limited: boolean } - true if the request should be blocked
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ limited: boolean }> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // Fail closed with in-memory fallback — don't allow unlimited requests
    console.error("[RateLimit] RPC error, using in-memory fallback:", error.message);
    const isLimited = memoryRateLimit(key);
    return { limited: isLimited };
  }

  // data is the boolean return value from the PG function
  // true = allowed, false = rate limited
  return { limited: data === false };
}
