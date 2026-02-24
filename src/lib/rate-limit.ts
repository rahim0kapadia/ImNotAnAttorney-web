/**
 * PostgreSQL-based rate limiting via Supabase RPC.
 *
 * Uses the `check_rate_limit` function created in migration 004.
 * Each route passes a key (e.g., "subscribe:{ip}") with a max request
 * count and window duration. The DB handles atomic check-and-increment.
 *
 * Usage:
 *   const { limited } = await checkRateLimit(supabase, `subscribe:${ip}`, 5, 60);
 *   if (limited) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

import { SupabaseClient } from "@supabase/supabase-js";

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
    // Fail open — don't block requests if rate limiting is broken
    console.error("[RateLimit] RPC error:", error.message);
    return { limited: false };
  }

  // data is the boolean return value from the PG function
  // true = allowed, false = rate limited
  return { limited: data === false };
}
