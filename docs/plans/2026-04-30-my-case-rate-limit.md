# Plan: /my-case/* rate limiting

Date: 2026-04-30
Source: docs/handoffs/2026-04-30-data-orphans-merged-cron-shipped.md Step 6
Related: PR #26 (data-orphans), security-auditor R2 finding — middleware matcher does NOT cover `/my-case/*` page routes today.

## Problem

`/my-case/*` defendant-portal pages (incl. new pairing-matrix surface from PR #26) are NOT in `middleware.ts` matcher. Result:
- No auth gate at edge — pages rely on Server Component `requireAdmin`/`requireTier` runtime checks per route.
- No rate limit. A scraper hitting `/my-case/<token>/pairing-matrix` repeatedly burns Supabase egress + Resend digest send budget without backpressure.
- No bot/AbuseIPDB protection.

## Files to Modify

- `src/middleware.ts` — extend matcher to include `/my-case/:path*`.
- `src/lib/rate-limit/my-case-limiter.ts` — NEW, token-bucket per `case_token` + per-IP composite key, Redis or Supabase Postgres backend (reuse existing rate-limit infra if any, e.g., upstash).

## Files to Create

- `src/lib/rate-limit/my-case-limiter.ts`
- `src/__tests__/middleware-my-case-rate-limit.test.ts`
- `docs/security/my-case-rate-limit-decisions.md` — decisions log (per-token vs per-IP, what 429 returns, retry-after policy).

## Tasks

1. Audit existing rate-limit infra (`grep -r 'rate.?limit'` web + monorepo). If upstash already wired (`@upstash/ratelimit`), reuse. Else evaluate Postgres-table sliding-window for $0 budget.
2. Decide token-bucket parameters: 60 reads/min/case_token, 600/hour/IP soft cap (audit/abuse alarm above), 200/hour/case_token absolute. Cite Peep Laja's defendant-experience principles — defendant must not experience 429 in normal flow.
3. Write limiter lib + middleware integration.
4. vitest for limit boundaries + 429 response shape.
5. Update `middleware.ts` matcher to include `/my-case/:path*`.
6. Verify: SC-A defendant hitting normal pace never 429s; SC-B scraper at 100/sec gets 429 on read 61.

## Out of Scope

- IP-allowlist (defendant could be on shared/changing IP — token-bound, not IP-bound).
- Cloudflare WAF — separate ticket.
- Email digest rate limit — already protected by 30s per-send timeout (R2 fix).

## Tracking

Spawn as standalone worry once `worry-data-orphans-tier-b-c` (T3-T11) ships, OR fold into engine-side wiring follow-up.
