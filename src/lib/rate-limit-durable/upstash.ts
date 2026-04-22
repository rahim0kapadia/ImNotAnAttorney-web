/**
 * Upstash Redis implementation of DurableRateLimitStore.
 *
 * Uses the Upstash REST SDK (@upstash/redis). Reads env vars at construction
 * time:
 *   - UPSTASH_REDIS_REST_URL
 *   - UPSTASH_REDIS_REST_TOKEN
 *
 * Redis semantics: INCR key, then EXPIRE key windowSeconds the FIRST time
 * the key's counter hits 1. Standard sliding-window rate-limit pattern.
 * Atomic across all Vercel isolates.
 *
 * Activated by setting DURABLE_RL_PROVIDER=upstash on the deploy. Without
 * that env (or with it unset), the no-op store is used and this class is
 * never instantiated — so the @upstash/redis dep is dead-code at request
 * time when durable rate-limiting is off.
 */

import { Redis } from "@upstash/redis";
import type { DurableRateLimitStore } from "./types";

export class UpstashDurableRateLimitStore implements DurableRateLimitStore {
  private readonly redis: Redis;

  constructor() {
    // Redis.fromEnv() reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
    // If either is missing it throws at construction time — the factory
    // surfaces that as a clear config error rather than a request-time 500.
    this.redis = Redis.fromEnv();
  }

  async increment(key: string, windowSeconds: number): Promise<number> {
    // INCR returns the post-increment count. On first set (count === 1),
    // stamp the TTL so the counter expires at window end. Subsequent INCRs
    // within the window reuse the existing TTL.
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    return count;
  }
}
