# Durable rate-limit fallback

The primary rate limiter is Supabase RPC (`check_rate_limit`). When that's
unreachable, `src/lib/rate-limit.ts` falls back to an in-memory store.
On Vercel's serverless runtime, in-memory is per-isolate — N warm lambdas
means an N-fold effective limit during a Supabase outage.

For high-sensitivity keys (magic-link 3/hour, password-reset-style flows),
that's too loose. This directory holds the abstract contract for a durable
cross-isolate fallback. Pick a provider and implement.

## Contract

`DurableRateLimitStore.increment(key, windowSeconds)` — atomically
increment a counter keyed by `key` within a `windowSeconds` window, return
the post-increment count. Cross-isolate atomicity is the whole point;
Redis `INCR` + `EXPIRE` (on first set) is the canonical implementation.

## To wire Upstash Redis

1. `npm install @upstash/redis`
2. Add envs to Vercel: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `DURABLE_RL_PROVIDER=upstash`
3. Create `src/lib/rate-limit-durable/upstash.ts`:

   ```ts
   import { Redis } from "@upstash/redis";
   import type { DurableRateLimitStore } from "./types";

   export class UpstashDurableRateLimitStore implements DurableRateLimitStore {
     private redis = Redis.fromEnv();

     async increment(key: string, windowSeconds: number): Promise<number> {
       const count = await this.redis.incr(key);
       if (count === 1) {
         await this.redis.expire(key, windowSeconds);
       }
       return count;
     }
   }
   ```

4. In `factory.ts`, swap the `"upstash"` case from throw to:

   ```ts
   case "upstash": {
     const { UpstashDurableRateLimitStore } = await import("./upstash");
     cached = new UpstashDurableRateLimitStore();
     return cached;
   }
   ```

   (the factory signature becomes async; `checkRateLimit` needs an `await` too)

## To wire Vercel KV

Same shape; `npm install @vercel/kv`, envs `KV_URL` / `KV_REST_API_URL` / `KV_REST_API_TOKEN`, `DURABLE_RL_PROVIDER=vercel-kv`, implement `vercel-kv.ts` with the same contract.

## Why ship the abstraction before a provider?

Ships the call-site change (`checkRateLimit({ durable: true })`) today so
magic-link is marked for durable-fallback as soon as a provider is wired.
Prevents a future "wire the provider but now find every call-site that
should opt in" sweep.
