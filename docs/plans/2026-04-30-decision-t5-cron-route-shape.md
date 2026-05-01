# T5 Cron Route Shape: Per-State, Not Per-Chapter

Date: 2026-04-30
Slug: t5-cron-route-shape
Parent worry: 2026-04-30-worry-statute-phase2.md (T5)

## CASCADE
- us (INAA): single per-state route per state = 3 cron-job.org jobs total instead of 33 (NC=7 + WA=12 + OH=14). Less monitoring surface, fewer failure modes, less cron-job.org rate-limit pressure.
- direct counterparty (defendants whose IB references freshly-amended statutes): refresh runs detect drift weekly without operator intervention; defendant gets up-to-date citations whether or not the legislature amended that morning.
- downstream (defendant's attorney): refresh logs are auditable per-state; attorney can verify "as of <date>" stamp on every cited statute.
- ecosystem (cron-job.org free tier, Vercel function-budget): 3 jobs vs 33 = ~10x lower call volume against shared infrastructure.
- future-us (Phase 3 states added next cohort): pattern is "one cron route per state by default; split per-chapter only if benchmark forces it"; new states inherit the simpler shape.
- adjacent players (other state-coverage civic-tech projects): pattern publishable as "default per-state, split-per-chapter only on measured timeout"; saves the next team the 33-job operational overhead.

No node loses. Cascade-positive.

## The call

Ship single-endpoint-per-state routes: `/api/cron/statutes-refresh-{nc,wa,oh}/route.ts` (3 routes, no `[chapter]` dynamic segment). This is the route shape the Phase 2 plan (line 415-441 of `2026-04-30-worry-statute-phase2.md`) has been pinned to since R0. T5 does NOT mirror the FL `[chapter]` route shape.

## Why FL is per-chapter

`/api/cron/statutes-refresh-fl/[chapter]/route.ts` (live since PR #120 / 2026-04-24) has one route handler that takes `chapter` as a dynamic path segment, called by 6 cron-job.org jobs (one per FL chapter: 316, 775, 784, 810, 812, 893).

Origin reasoning (per route file lines 30-37): "ch316 has 282 sections. At 5-way parallel + 0.5-2s random delay per fetch, worst case is ~60-90s. 300s leaves comfortable headroom."

FL Ch 316 is the largest single chapter at 282 sections; serial-with-concurrency-5 fits inside Vercel's 300s `maxDuration` per cron invocation. Splitting cron-job.org calls per chapter sidesteps any single-call timeout risk.

## Why NC/WA/OH DON'T need per-chapter routes by default

For refresh runs (hash-diff path, NOT seed), each section is ~1.4s wall time at single-threaded:
- 1 fetch (rate-limited 0.5-2s) + 50ms parse + 100ms DB UPDATE = ~1.4s/section sequential
- With concurrency-5 parallel: effective ~0.3s/section

| State | Total sections (post-seed) | Sequential | Concurrency-5 |
|---|---|---|---|
| NC | ~1500 (Ch 14 alone is ~1145) | ~35 min | ~5 min |
| WA | ~600 across 12 chapters | ~14 min | ~2 min |
| OH | ~420 across 14 chapters | ~10 min | ~1.5 min |

All 3 fit under Vercel Pro's 300s `maxDuration` with concurrency-5. Per-chapter splitting would be over-engineering for current scale.

## Final route shape (per-state, concurrency-5)

```
apps/web/src/app/api/cron/statutes-refresh-nc/route.ts
apps/web/src/app/api/cron/statutes-refresh-wa/route.ts
apps/web/src/app/api/cron/statutes-refresh-oh/route.ts
```

Each route:
- `export const runtime = "nodejs"`
- `export const maxDuration = 300`  (Pro default; bump to 900 only if measurements force it)
- `requireCron(req)` auth gate
- Hash-diff fetch loop with `parallelMap` concurrency-5 (port from FL refresh route lines 273-290)
- Hostname allowlist Set check (per-state)
- Returns `{status:"ok", checked:N, updated:M, skipped:N-M}`

## What carries forward from FL

Port these helpers verbatim into the new per-state routes (or extract to a shared `lib/statute-refresh.ts`):

- `safeFetch(url, fetchImpl)` — `redirect: 'manual'` + Location re-validation through hostname Set (FL route lines 248-270)
- `parallelMap(items, limit, fn)` — concurrency-limited parallel processor (lines 273-290)
- `computeSectionHash(titleText, bodyText)` — SHA-256 over `titleText + '\n\n' + bodyText` (line 241-245)
- `acquireCronLock` / `releaseCronLock` for idempotency (lines 374-401)

## What's different per state

Each state's route imports its own:
- Chapter map (mirrors `<STATE>_CHAPTERS` from the seed script)
- Hostname Set (`ALLOWED_HOSTNAMES`)
- `extractSectionNumbers` + `parseSectionPage` parser (re-implement in TS or import .mjs via dynamic import)

## Why NOT per-chapter for NC/WA/OH

- NC: 7 chapters x 1 cron-job.org job each = 7 jobs. NC at ~1500 sections fits in single 300s window with concurrency-5; no need to split.
- WA: 12 chapters means 12 jobs. Same logic.
- OH: 14 chapters means 14 jobs. Same.

Per-chapter only adds operational surface (more cron jobs to monitor, more `acquireCronLock` keys, more failure modes).

FL stayed per-chapter because Ch 316's 282 sections at the original conservative 1.25s/section sequential = 350s, too close to the 300s wall. With concurrency-5 added in FL refresh route, Ch 316 finishes in 60-90s. So FL's per-chapter shape is overengineering against its current implementation.

## Carry-forward note

If a future state's largest chapter exceeds 5 minutes at concurrency-5 (~1500 sections in one chapter), revisit per-chapter shape for that state. NC Ch 14 at ~1145 sections x 0.2s = 229s, borderline. T5 implementer should benchmark NC Ch 14 first; if it consistently runs >250s, split NC into per-chapter form.

## cron-job.org schedule

Single cron-job.org job per state (3 total):
- NC: Mon 17:00 UTC
- WA: Wed 17:00 UTC
- OH: Thu 17:00 UTC

## Acceptance criteria for T5 PR

- 3 new files: `statutes-refresh-{nc,wa,oh}/route.ts` (no `[chapter]` segment)
- Each route uses concurrency-5 parallel fetch
- All 3 reuse `requireCron` + `acquireCronLock`/`releaseCronLock` from existing helpers
- Tests verify: (a) auth gate denies missing token, (b) chapter discovery to section fetch to hash-diff to UPDATE flow against fixtures, (c) returns expected JSON shape
- cron-job.org jobs registered (3 jobs) via API per global CLAUDE.md
- Phase-3 token-rotation worry file exists at `docs/plans/2026-05-XX-worry-cron-auth-token-rotation.md` (already shipped: `2026-05-01-worry-cron-auth-token-rotation.md`)

## NC large-chapter contingency

If NC Ch 14 benchmarks >250s in T5 implementer's first measurement, split NC into per-chapter form: `statutes-refresh-nc/[chapter]/route.ts` with 7 cron-job.org jobs (matching FL pattern). All other states stay per-state.

## Status

LOCKED. Ship T5 implementation against this spec. AZ refresh stays out-of-scope for T5 (engine-worker host per Phase 2 plan).
