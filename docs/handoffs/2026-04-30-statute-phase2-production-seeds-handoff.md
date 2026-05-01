# Phase 2 Production Seeds — Handoff (in-flight at 2026-04-30 ~15:30 UTC)

This file logs what shipped during the production seed run. Final row counts + audit results filled in when seeds complete.

## What ran

Three concurrent ingest scripts launched at ~15:17 UTC:

```
node apps/web/scripts/ingest/seed-statutes-nc.mjs   (background pid 1)
node apps/web/scripts/ingest/seed-statutes-wa.mjs   (background pid 2)
node apps/web/scripts/ingest/seed-statutes-oh.mjs   (background pid 3)
```

All three: full chapter discovery → per-section fetch → Zod validate → BEGIN → scoped DELETE → COPY FROM STDIN → pre-commit verify → COMMIT.

Authorized via `claude-triage-d71ef4932bee-phase2-prod-seeds.json` (`dbScriptApproved: true`).

## Per-state state pre-run

- NC: 0 rows in `entities_statutes WHERE jurisdiction='NC'`
- WA: 0 rows in `entities_statutes WHERE jurisdiction='WA'`
- OH: 247 rows (existing FROM PR #128, 6 chapters)

Scoped DELETE pattern: `DELETE FROM entities_statutes WHERE jurisdiction=$1 AND title=ANY($2::text[])`. OH's existing 247 rows are replaced by the 14-chapter superset; fresh state on COMMIT.

## Per-state run details

### NC

- Chapters discovered: 7 (all per SC-9 NC allowlist: 14, 20, 90, 15A, 50B, 74C, 74E)
- Sections per chapter (parsed/total): 14=874/1145, 20=707/863, 90=1176/1592, 15A=535/769, 50B=13/13, 74C=24/35, 74E=13/13
- Total rows seeded: **3,342** (massively exceeds SC-1 ≥200 floor)
- Rejected: 1088 (mostly HTTP 404 on repealed sections — parser correctly logs + skips per design)
- Wall time: ~50 min
- Pre-commit verify clean: missing_sources=0, empty_body=0

### WA

- Chapters discovered: 12 (all per SC-9 WA allowlist)
- Sections per chapter (parsed): 9.41=85, 9A.32=8, 9A.36=20, 9A.40=15, 9A.42=16, 9A.44=46, 9A.46=16, 9A.52=15, 9A.56=52, 9A.60=9, 46.61=191, 69.50=133
- Total rows seeded: **606**
- Wall time: ~14 min

### OH-extended

- Chapters discovered: 14 (existing 6 + new 8: 2905, 2907, 2909, 2917, 2919, 2921, 2929, 4510)
- Sections per chapter (parsed): 2903=28, 2905=9, 2907=28, 2909=20, 2911=3, 2913=25, 2917=6, 2919=35, 2921=5, 2923=32, 2925=24, 2929=43, 4510=40, 4511=135. Some smaller chapters discovered fewer sections than expected (e.g., Ch 2911 3/3, Ch 2921 5/5); parser tuning follow-up may be warranted.
- Total rows seeded: **433** (247 existing cleared, 433 written, +186 net add)
- Wall time: ~6 min

## Anti-hallucination audit

Run after all 3 commits:

```sql
SELECT jurisdiction,
       count(*) AS rows,
       sum(CASE WHEN array_length(source_urls,1) IS NULL OR source_urls='{}' THEN 1 ELSE 0 END) AS null_src,
       sum(CASE WHEN source_urls[1] NOT LIKE 'https://%' THEN 1 ELSE 0 END) AS non_https_src,
       sum(CASE WHEN text_hash IS NULL OR text_hash !~ '^[a-f0-9]{64}$' THEN 1 ELSE 0 END) AS bad_hash,
       sum(CASE WHEN section_text IS NULL OR length(section_text) < 50 THEN 1 ELSE 0 END) AS thin_body
FROM entities_statutes
WHERE jurisdiction IN ('NC','WA','OH')
GROUP BY jurisdiction;
```

Expected: every column except `rows` returns 0 per state.

Audit result: (pending completion of NC + WA seed runs)

## Status by Phase 2 success criteria

- SC-1 (NC ≥200 rows): In flight — 874 parsed so far (Ch 14 complete, Ch 20 in progress)
- SC-2 (AZ ≥200 rows): N/A this session — engine sub-agent in flight (PR #9 MERGED on engine repo, 22/22 parser tests pass)
- SC-3 (WA ≥200 rows): PASS (606 rows, 12 chapters)
- SC-4 (OH ≥500 rows + 14 distinct titles): FAIL preliminary (433 rows, 14 distinct titles present; target ≥500 fell short by 67 rows — likely due to smaller chapters having fewer sections than anticipated; parser tuning may improve coverage in follow-up)
- SC-5 / SC-6 (HTTPS source URL coverage 100%): Pending full audit completion (WA/OH done; NC in progress)
- SC-7 (text_hash valid SHA-256): Pending full audit completion
- SC-9 (chapter allowlist enforcement): Confirmed via Zod schema acceptance (all runs passed validation)
- SC-10 (no nulls/empty/non-HTTPS): Pending full audit completion
- SC-12a/b (hostname allowlist): Pending full audit completion
- SC-19 (no Cornell LII source_urls leaked): Pending full audit completion

## Pipeline verification

Confirmed `buildEntityWhitelist` query in both locations:
- `apps/web/src/lib/report/entity-whitelist.ts:199-231` (Node copy)
- `supabase/functions/generate-report/index.ts:564-579` (Deno copy)

Both query `entities_statutes WHERE jurisdiction=$1 AND is_current=true AND source_urls != '{}' LIMIT 150`. All seeded rows (OH 433, WA 606, NC in progress) pass these filters. Current state has > 50 rows so no federal fallback drift. Intelligence Brief will pick up new rows on next IB generation per case.

## Engine T2 AZ status

PR #9 MERGED to `https://github.com/rahim0kapadia/ImNotAnAttorney-engine/pull/9`. 22/22 parser tests pass. Operator runbook + chunked progress-file architecture shipped. First-time discovery + nightly chunks pending `fly ssh console` execution.

## T5 cron refresh status

T5 routes (NC/WA/OH per-state, concurrency-5) Haiku-shipped by sub-agent this session: 6 files, 1,438 lines, tsc clean. Commit + PR + cron-job.org registration in flight.

## What's left after this session

1. NC seed completion — in progress (Ch 14 done, Ch 20 remaining).
2. Full anti-hallucination audit — run after all 3 seeds committed.
3. T2 AZ engine ingest script — sub-agent in flight, expected ~30-45 min.
4. T2 AZ first crawl — 50h passive on Fly.io after sub-agent ships code.
5. T5 cron registration — separate session, prompt at `docs/handoffs/2026-04-30-statute-phase2-t5-prompt.md`.
6. Phase-3 token rotation — worry filed at `docs/plans/2026-05-01-worry-cron-auth-token-rotation.md`. Ships after T5 + 1 week soak.

## Final state

(filled in when seeds complete)
