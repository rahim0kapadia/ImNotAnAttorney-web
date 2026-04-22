/**
 * Factory that returns the configured DurableRateLimitStore based on the
 * DURABLE_RL_PROVIDER env var.
 *
 *   unset / "none" / empty      → no-op (falls through to in-memory)
 *   "upstash"                   → throws until implemented (see README)
 *   "vercel-kv"                 → throws until implemented (see README)
 *
 * Called by `checkRateLimit` only when `{ durable: true }` opts in AND
 * the primary Supabase RPC errored.
 *
 * To implement a provider: add `src/lib/rate-limit-durable/upstash.ts`
 * (or `vercel-kv.ts`) exporting a class that implements
 * DurableRateLimitStore, then swap the corresponding `throw` below for
 * `return new YourImpl(...)`. See README.md in this directory for detail.
 */

import type { DurableRateLimitStore } from "./types";
import { NoopDurableRateLimitStore } from "./noop";
import { UpstashDurableRateLimitStore } from "./upstash";

let cached: DurableRateLimitStore | null = null;

export function getDurableRateLimitStore(): DurableRateLimitStore {
  if (cached) return cached;

  const provider = (process.env.DURABLE_RL_PROVIDER ?? "").trim().toLowerCase();

  switch (provider) {
    case "":
    case "none":
      cached = new NoopDurableRateLimitStore();
      return cached;

    case "upstash": {
      // Static import at the top of this file is safe because @upstash/redis
      // is a regular dep (installed in Round 4). When DURABLE_RL_PROVIDER is
      // unset or "none" this class is never instantiated, so the dep is
      // dead-code at runtime in the default config.
      cached = new UpstashDurableRateLimitStore();
      return cached;
    }

    case "vercel-kv":
      throw new Error(
        "DURABLE_RL_PROVIDER=vercel-kv but provider is not implemented. " +
          "Install @vercel/kv, create src/lib/rate-limit-durable/vercel-kv.ts, " +
          "and wire it in this factory. See src/lib/rate-limit-durable/README.md.",
      );

    default:
      throw new Error(
        `DURABLE_RL_PROVIDER="${provider}" is not a known value. ` +
          `Valid: unset, "none", "upstash", "vercel-kv".`,
      );
  }
}

/** Test-only: reset the cached store so a new factory call re-evaluates env. */
export function __resetDurableStoreCache(): void {
  cached = null;
}
