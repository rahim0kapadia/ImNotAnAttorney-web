/**
 * No-op durable store — signals "no durable fallback configured; use
 * in-memory." The checkRateLimit helper detects a no-op and routes to
 * the in-memory fallback as before, so behavior is unchanged.
 *
 * The `increment` throws a sentinel error the caller uses to fall through
 * rather than returning a meaningless number.
 */

import type { DurableRateLimitStore } from "./types";

export class NoopDurableRateLimitStore implements DurableRateLimitStore {
  async increment(_key: string, _windowSeconds: number): Promise<number> {
    throw new Error("NOOP_DURABLE_STORE");
  }
}
