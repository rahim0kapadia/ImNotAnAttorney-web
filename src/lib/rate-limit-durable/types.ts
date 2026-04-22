/**
 * Contract for durable rate-limit stores used as a last-resort fallback when
 * the primary (Supabase RPC `check_rate_limit`) is unreachable.
 *
 * Why durable? The default in-memory fallback in `src/lib/rate-limit.ts` is
 * per-isolate. On Vercel, N warm lambdas means N independent counters, so a
 * 3/hour limit becomes effectively 3×N/hour during a Supabase outage — bad
 * for magic-link and other authenticated-abuse-attractive keys.
 *
 * Implementations supply a single `increment(key, windowSeconds)` that
 * atomically increments a counter keyed by `key` and returns the
 * post-increment count. Implementations are responsible for TTL / window
 * expiry.
 *
 * No provider is shipped by default. Pick Upstash or Vercel KV, add the
 * dep, and implement this contract in a sibling file (e.g.
 * `src/lib/rate-limit-durable/upstash.ts`).
 */

export interface DurableRateLimitStore {
  /**
   * Atomically increment the counter for `key` within a sliding or tumbling
   * `windowSeconds`-second window. Return the post-increment count. The
   * caller compares the count against its own max-requests threshold.
   *
   * Implementations MUST guarantee cross-isolate atomicity (that's the
   * whole point of this contract). A basic Redis INCR + EXPIRE (on first
   * set) is sufficient.
   */
  increment(key: string, windowSeconds: number): Promise<number>;
}
