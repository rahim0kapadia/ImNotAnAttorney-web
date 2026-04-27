# D-T3: Precedent Watchlist ($47) — Flip Live

**Date:** 2026-04-26
**Branch:** `fix/dt3-precedent-watchlist-flip-live`
**Closes:** D-T3 deferred Tier 9 dark from the 2026-04-25 audit closeout.

## Problem

`precedent-watchlist` ($47) sat at `live: false` + `isActive: false`
with the comment `"awaiting E2E + cron registration verification"`. The
product is "Instant + 30-day email drip" — instant brief on first
purchase + 4 weekly updates over 30 days when rising-precedent ranks
shift for the buyer's charge type. The drip needs the
`precedent-watchlist-emails` cron registered with cron-job.org and
hitting prod weekly.

## Verification (2026-04-26)

### Data
- `citation_velocity_criminal`: **1,133,227 rows** (PostgREST count)
- Rising-flagged criminal opinions w/ source_url: **358** rows
  (jurisdiction filter `RISING_JURISDICTION_FILTER` = F/FB/FD/FS/FSP/FT/FU)
- Charge cluster sets:
  - `dui%`: **32 clusters** (≥ `CHARGE_FILTER_MIN_ROWS=3`)
  - `drug-trafficking%`: **7 clusters** (≥ `CHARGE_FILTER_MIN_ROWS=3`)

Both meet the resolver's charge-filter threshold, so charge-specific
top-N is preferred over the national fallback. National fallback also
healthy (358 rising rows w/ URLs — well above
`RISING_COUNT=10` + `FALLING_COUNT=5` ceiling).

### Cron registration (cron-job.org)
- jobId: **7522215**
- URL: `https://imnotanattorney.com/api/cron/precedent-watchlist-emails`
- Schedule: weekly, **Mondays 09:00 UTC**
- Enabled: **true**
- History: 0 entries (first run = Monday 2026-04-27 09:00 UTC)

The companion `rising-precedent-alerts` cron (jobId 7516619, WR/SR drip)
is also registered — but it serves War Room / Situation Room, not
Precedent Watchlist. The Watchlist drip is driven by
`watchlist_email_state` on `orders`, not `rising_precedent_alerts_log`.

### Route
- Path: `src/app/api/cron/precedent-watchlist-emails/route.ts`
- Vercel function maxDuration: **300s** (vercel.json)
- Auth: `requireCron(req)` returns 401 without `CRON_AUTH_TOKEN`
- Live probe: `GET /api/cron/precedent-watchlist-emails` returned
  HTTP **401** without bearer (guard correct)
- Primary-domain guard: rejects RESEND_FROM_EMAIL on
  `imnotanattorney.com`/`inaa.com`/`tastedrop.com`/`cloudculture.com`/
  `myculture.cloud` before any DB read (mirrors
  `warroom-monthly-precedent-delta` pattern)

### Tests
- `src/lib/tier9-reports/__tests__/precedent-watchlist.test.ts`:
  **14/14 passing**
- `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck`:
  **0 errors** (after `rm -rf .next/types`)
- `node scripts/check-tiers.mjs`: **OK**

## First-run behavior

The cron route queries
`orders WHERE watchlist_email_state IS NOT NULL`. With zero purchases
since flip, the first scheduled firing (Mon 09:00 UTC) returns
`{ ok: true, orders_considered: 0, sent: 0, skipped: 0 }` — a healthy
no-op confirming the route + auth + guard wiring all work end-to-end.
Subsequent purchases populate `watchlist_email_state` via the resolver
on instant delivery; from there the drip cadence applies.

## Decision

All gates pass → flip both flags.

| File | Old | New |
|------|-----|-----|
| `src/lib/tiers.ts` `precedent-watchlist.live` | `false` | `true` |
| `src/lib/products.ts` `precedent-watchlist.isActive` | `false` | `true` |

Price unchanged ($47). URL slug unchanged. DB tier_slug unchanged.
Resolver, cron route, schema, and unit tests all pre-existed and
verified — no logic changes in this PR.

## Cited rules / experts

- Hormozi entry-tier wedge — $47 floor SKU sits below the $97 playbook
  band, anchoring the crisis-buyer ladder.
- Chaperon trust-engine — drip threshold (`RANK_DELTA_THRESHOLD = 3`)
  prevents over-notification, preserving inbox trust.
- HARD rule `never-cold-email-from-primary-domain` — primary-domain
  guard already in route since 2026-04-23 wave-pristine R1 #5.

## Out of scope

- Schema changes (none — `watchlist_email_state` migration
  `20260423e_watchlist_email_state.sql` already deployed).
- Cron schedule tuning (Mondays 09:00 UTC stays — purchases trickle, no
  reason to over-fire).
- Resolver behavior (already PRISTINE per data-to-product wave).

## Note on PR creation

The main repo checkout at
`C:\Users\email\projects\ImNotAnAttorney-web` was held by a sibling
session running D-T1 (district-court flip) — branch
`fix/dt1-district-court-flip-live` with staged work. To honor
`prevent-branch-stomp` and `prevent-working-tree-stomp` rules I created
this branch in an isolated worktree at
`C:\Users\email\projects\_worktrees\dt3-precedent-watchlist` based on
`origin/master`. Push + PR happen from there. Sibling D-T1 work is
untouched.
