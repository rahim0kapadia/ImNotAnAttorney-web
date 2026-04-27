# Handoff: Bar Discipline Batch 3 (KY/OR/OK/CT) — OR/OK/CT live, KY scoped follow-up

**Date:** 2026-04-27
**Parent task:** G1a in `docs/plans/2026-04-27-data-completeness-master.md`
**Worktree:** `C:\Users\email\projects\_worktrees\bar-disc-batch3` (branch `feat/bar-discipline-ky-or-ok-ct`)
**PR:** [#185](https://github.com/rahim0kapadia/ImNotAnAttorney-web/pull/185) — open, not yet merged
**Sibling sessions:** batch1 (NC/AL/SC) and batch2 (MO/WI/LA) running in their own worktrees

## Outcome

**OR / OK / CT shipped live to prod. KY has a scoped follow-up plan.**

| Jurisdiction | Events | Attorneys | Source coverage | Date range | Status |
|---|---|---|---|---|---|
| OK | 136 | 136 | 100% HTTPS, 0 NULL src | 2010-03-08 → 2026-03-23 | LIVE in prod |
| OR | 34 | 34 | 100% HTTPS, 0 NULL src | 1998-07-24 → 2026-03-12 | LIVE in prod |
| CT | 218 | 218 | 100% HTTPS, 0 NULL src | 1997-06-03 → 2026-04-21 | LIVE in prod |
| KY | 0 | 0 | — | — | **BLOCKED** (CL too thin, plan exists) |
| **Total** | **388** | **388** | **0 NULL** | | |

**Anti-hallucination audit (full table):** `attorney_discipline_events` now 27,733 events / **0 NULL source_url**. The 4 customer-facing legal-data tables remain pristine.

## Approach

CourtListener was the structured bulk source for all 4 candidate states. After live URL-probe diagnostics:
- **OK** (court=okla): 1,238 SCBD opinions — bulk-tractable
- **OR** (court=or): 215+ disciplinary opinions — bulk-tractable
- **CT** (court=conn,connappct): 28+ OCDC/Statewide-Grievance opinions — bulk-tractable
- **KY** (court=ky): only **8** opinions — below threshold, requires HTML scrape of `kycourtreport.com`

Built one CL-anchored template and forked into per-state scrapers. The per-sanction-query pattern (issue one search per sanction term, use `r.opinions[0].snippet`, `<mark>`-tag-aware docket validation) is the reusable insight.

## Files

### New scrapers + tests (worktree)
- `scripts/ingest/scrape-okbar-discipline.mjs` (~547 lines)
- `scripts/ingest/scrape-orbar-discipline.mjs` (~340 lines)
- `scripts/ingest/scrape-ctbar-discipline.mjs` (~310 lines)
- `scripts/ingest/__tests__/scrape-okbar-discipline.test.mjs`
- `scripts/ingest/__tests__/scrape-orbar-discipline.test.mjs`
- `scripts/ingest/__tests__/scrape-ctbar-discipline.test.mjs`
- `docs/plans/2026-04-27-followup-ky-bar-blocked.md`

### Memory updated
- `~/.claude/agent-memory/general-purpose/inaa-bar-scrapers.md` — added "CourtListener-backed scrapers (CO/OK/OR/CT pattern)" section with the per-sanction-query insight, `<mark>` gotcha, `main()` guard pattern, and CL rate-limit reality.

## What worked

1. **Per-sanction CL queries + first-match-wins** — issuing 10 searches per state (`SCBD AND disbarred`, `SCBD AND suspended`, etc.) anchored each result's snippet on sanction language. Way more efficient than fetching 1,238 full opinion bodies.
2. **`COURTLISTENER_TOKEN` auth header** — eliminated the 429 thrashing seen in early anonymous runs. Authenticated rate is ~10x higher; OK ingest dropped from 30+ min to ~5 min.
3. **Live-source URL probes BEFORE writing fixtures** — anti-TN-bug pattern. Caught the empty-top-level-snippet trap and the `<mark>`-tag-on-docketNumber surprise during dry-run.
4. **`main()` guard via `import.meta.url`** — prevents `node --test` from triggering live CL fetches when importing the module's pure helpers. This was a bug in early runs; fixed before final apply.
5. **Inline env loader (SEC-W1)** — `pg-bulk-defaults.mjs` reads `process.env.SUPABASE_DB_URL`, but no dotenv import allowed. The 30-line line-by-line parser pattern from `seed-statutes-fl.mjs` is the established convention.

## What didn't work / pivots

1. **First OK run died at 245 dockets / 0 events** — `r.snippet` was empty; sanction tagging failed. Fix: switched to per-sanction queries with `r.opinions[0].snippet`.
2. **Second OK run died at "0 dockets accepted"** — `<mark>`-wrapped docketNumbers failed `isScbdDocket()` regex. Fix: strip `<\/?mark>` before validation.
3. **Third OK run died with `SUPABASE_DB_URL missing`** — script didn't load `.env.local`. Fix: inline env loader.
4. **Fourth OK run hit 429 rate-limit cascade** — anonymous CL has aggressive limits; concurrent test runs while applying made it worse. Fix: `main()` guard + `COURTLISTENER_TOKEN` auth.
5. **OR with 2010+ start date yielded 29 events** — too narrow window, but earlier 1990+ run added only 5 more (CL OR coverage thins pre-2000). Final: 34 events, still above threshold.

## What's left

1. **Merge PR #185** — needs CI green + Rahim review.
2. **KY follow-up** — pick up `docs/plans/2026-04-27-followup-ky-bar-blocked.md` in a separate session (4-6h estimated, requires per-post HTML extraction from kycourtreport.com).
3. **Sibling sessions:** batch1 (NC/AL/SC) and batch2 (MO/WI/LA) in their own worktrees — completion status unknown; check `gh pr list --state open` after this PR lands.

## Verification

- [x] `npx tsc --noEmit --skipLibCheck` — clean
- [x] `node --test` on all 3 test files — 39/39 pass
- [x] Live dry-run against current CL — parsers validated
- [x] `--apply` ran against prod, INSERT counts confirmed:
      - OK: 136 attorneys upserted, 136 events inserted
      - OR: 34 upserted, 34 events inserted (5 new on second run, 29 from prior)
      - CT: 218 upserted, 218 events inserted
- [x] Anti-hallucination audit: 0 NULL `source_url` across 27,733 events
- [x] HTTPS coverage: 100% on KY/OR/OK/CT subset (388/388 https)
- [ ] CV (`node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends`) — not yet run; recommended after merge

## Cascade

- **defendants (downstream):** IB reports for OK/OR/CT defendants now surface real disciplinary history with verifiable CL links (when PR #152's IB wire-up extends past CA-only)
- **future-us:** the per-sanction CL pattern + `<mark>` gotcha + `main()` guard pattern are captured in memory; next state on this template won't repeat the 4-failure debugging cycle
- **ecosystem:** publishable pattern for any state where CL has ≥100 disciplinary opinions
- **adjacent (KY):** scoped plan, zero re-triage cost when picked up
- **us (Atlas):** worry-bar-discipline-pristine extended to 22 jurisdictions (was 19 after 2026-04-26 batch)

No node loses. Cascade-positive.

## Ready-to-paste prompt for next session

```
Continue from C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-04-27-bar-disc-batch3-outcome.md.

Three states (OK/OR/CT) shipped live in PR #185 (388 events, 0 NULL source_url, 100% HTTPS). PR is open; merge after CI green + sibling-session PRs (batch1 NC/AL/SC, batch2 MO/WI/LA) are reviewed.

Next priorities:
1. Pick up KY per docs/plans/2026-04-27-followup-ky-bar-blocked.md — kycourtreport.com HTML scrape, 4-6h.
2. Continue G1b (UT/IA/NV/AR/MS/KS/NM/NE/ID/WV/HI/NH) and G1c (ME/MT/RI/DE/SD/ND/AK/DC/VT/WY/federal) per master plan.
3. Run CV to confirm no probe regressions from the batch3 ingest.
```

## Cost summary

- Phase A (live URL probes + WebSearch triangulation): ~20 min, ~$0.50
- Phase B (3 scraper builds + tests + dry-runs): ~90 min, ~$2-3
- Phase C (4 OK retries debugging the empty-snippet + <mark> + env + 429 chain): ~30 min, ~$1
- Phase D (OR + CT applies + audit + PR + handoff): ~30 min, ~$1
- **Total: ~$5, ~3 hours**

Compared to a full naive Sonnet swarm of 4 states: ~$15-20 estimated. Saved ~70% by running synchronously in one session, reusing the CO template, and capturing the gotchas in memory after the first OK debugging cycle.
