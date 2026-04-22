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

## To wire Upstash Redis (automated)

1. Create Upstash account: console.upstash.com
2. Generate management API key: console.upstash.com/account/api
3. Generate Vercel token: vercel.com/account/tokens (scope: your team)
4. Run:
   ```
   UPSTASH_EMAIL=you@domain.com \
   UPSTASH_API_KEY=... \
   VERCEL_TOKEN=... \
   node scripts/setup-durable-rate-limit.mjs
   ```
5. Redeploy (git push or manual).

Script is idempotent — safe to re-run. See script header for optional env
overrides (DB_NAME, REGION, VERCEL_PROJECT).

To provision + wire on another Next.js-on-Vercel project: copy
`scripts/setup-durable-rate-limit.mjs` + the
`src/lib/rate-limit-durable/` directory, install `@upstash/redis`,
change the DB_NAME default in the script, run.

## To wire Vercel KV

Same shape; `npm install @vercel/kv`, envs `KV_URL` / `KV_REST_API_URL` / `KV_REST_API_TOKEN`, `DURABLE_RL_PROVIDER=vercel-kv`, implement `vercel-kv.ts` with the same contract.

## Why ship the abstraction before a provider?

Ships the call-site change (`checkRateLimit({ durable: true })`) today so
magic-link is marked for durable-fallback as soon as a provider is wired.
Prevents a future "wire the provider but now find every call-site that
should opt in" sweep.
