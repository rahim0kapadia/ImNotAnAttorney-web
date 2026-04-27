# Handoff: Bar Discipline Batch 8 (SD/ND/AK/DC/VT/WY) — 943 events live, all 6 states shipped

**Date:** 2026-04-27
**Parent task:** G1c in `docs/plans/2026-04-27-data-completeness-master.md`
**Worktree:** `C:\Users\email\projects\_worktrees\bar-disc-batch8` (branch `feat/bar-discipline-sd-nd-ak-dc-vt-wy`)
**PR:** [#194](https://github.com/rahim0kapadia/ImNotAnAttorney-web/pull/194) — MERGED 2026-04-27 05:24 UTC, commit `3f4ddd9a`

## Outcome

**All 6 states shipped live to prod.** No blockers. CL coverage of "small states" was significantly stronger than the judge-profiles G8 outcome suggested — every state cleared the ≥10 acceptance bar by a wide margin.

| Jurisdiction | Events | Attorneys | Source coverage | Date range | Status |
|---|---|---|---|---|---|
| SD | 28  | 25  | 100% HTTPS, 0 NULL src | 1990-05-09 → 2025-11-12 | LIVE |
| ND | 34  | 33  | 100% HTTPS, 0 NULL src | 2002-01-15 → 2025-09-22 | LIVE |
| AK | 27  | 27  | 100% HTTPS, 0 NULL src | 1991-01-25 → 2025-11-07 | LIVE |
| DC | 730 | 711 | 100% HTTPS, 0 NULL src | 1994-02-03 → 2026-04-23 | LIVE |
| VT | 36  | 31  | 100% HTTPS, 0 NULL src | 2009-12-24 → 2025-03-14 | LIVE |
| WY | 88  | 64  | 100% HTTPS, 0 NULL src | 2007-06-20 → 2026-04-08 | LIVE |
| **Total** | **943** | **891** | **0 NULL** | | |

**Anti-hallucination audit (full table):** `attorney_discipline_events` now 30,320 events / **0 NULL source_url** across the entire table. Customer-facing legal-data tables remain pristine.

## Approach

CourtListener was the structured bulk source for all 6 candidate states. Per-state CL coverage probed at session start:

- **SD** (court=sd): 95 anchored opinions; "Discipline of <Name>" / "In Re the Discipline of <Name>" / "Matter of Discipline of <Name>"
- **ND** (court=nd): 568 anchored opinions; "Disciplinary Board v. <Name>" / "Reciprocal Discipline of <Name>"
- **AK** (court=alaska): 96 anchored opinions; "In the Disciplinary Matter Involving <Name>" + legacy "In re <Name>"
- **DC** (court=dc): 1,651 anchored opinions; "In re <Name>" with "BG" docket suffix as noise filter
- **VT** (court=vt): 105 anchored opinions; "In Re <Name> (Office of Disciplinary Counsel)" + bare "In Re <Name>"
- **WY** (court=wyo): 234 anchored opinions; "Board of Professional Responsibility, Wyoming State Bar v. <Name>" with WSB number in caption

NM (PR #191) was the closest pattern donor — same `In re <Name>` / `Disciplinary Board` anchor approach. Forked into 6 per-state scrapers with state-specific caption + docket validators.

## Files

### New scrapers + tests (worktree)
- `scripts/ingest/scrape-sdbar-discipline.mjs` (~430 lines)
- `scripts/ingest/scrape-ndbar-discipline.mjs` (~395 lines)
- `scripts/ingest/scrape-akbar-discipline.mjs` (~440 lines)
- `scripts/ingest/scrape-dcbar-discipline.mjs` (~410 lines)
- `scripts/ingest/scrape-vtbar-discipline.mjs` (~445 lines)
- `scripts/ingest/scrape-wybar-discipline.mjs` (~450 lines)
- `scripts/ingest/__tests__/scrape-sdbar-discipline.test.mjs` (15 tests)
- `scripts/ingest/__tests__/scrape-ndbar-discipline.test.mjs` (14 tests)
- `scripts/ingest/__tests__/scrape-akbar-discipline.test.mjs` (16 tests)
- `scripts/ingest/__tests__/scrape-dcbar-discipline.test.mjs` (12 tests)
- `scripts/ingest/__tests__/scrape-vtbar-discipline.test.mjs` (15 tests)
- `scripts/ingest/__tests__/scrape-wybar-discipline.test.mjs` (12 tests)

Total: 85 unit tests, all passing.

## What worked

1. **Pre-build CL coverage probe.** Probed all 6 states upfront with anchor + sanction queries before writing any parser. Confirmed coverage and surfaced caption + docket patterns from real samples. ~10 min total. Prevented the AK judge-profiles G8 trap (assumed thin → would have skipped, would have missed 27 real events).

2. **Cross-validation harness BEFORE --apply.** Anti-TN-bug pattern: live CL fetches + per-result accept/reject inspection BEFORE any `--apply`. Caught 5 parser bugs at fixture review time, not after deploying garbage:
   - SD legacy "In Re the Discipline of" + "Matter of Discipline of" forms initially rejected
   - AK legacy "In re <Name>" + legacy docket "Supreme Court No. S-NNNNN" forms initially rejected
   - AK leading "Attorney " in name (e.g. "Attorney Gayle Brown") was kept as part of name
   - VT Esq/ODC parenthetical requirement was overly strict; bare "In Re <Name>" forms rejected
   - VT legacy "YYYY-NNN" docket form initially rejected

3. **Per-state docket as noise filter.** DC's "BG" suffix uniquely identifies bar-discipline matters (vs CA = criminal appeal). WY's "D-" prefix (vs "S-" for criminal). These docket gates are stronger filters than caption alone.

4. **WY WSB-number extraction from caption.** WY captions embed the real WSB number (e.g. "Wsb 8-6998") — extracted into bar_number ("WY:WSB-8-6998") for join-friendly identity. Falls back to docket-derived ID when WSB absent.

5. **`COURTLISTENER_TOKEN` auth header.** No 429 thrashing on full-state runs even for DC's 730 events across 200+ pages.

## What didn't work / pivots

1. **Initial AK parser rejected legacy `In re <Name>` form** — only accepted "In the Disciplinary Matter Involving" canonical form. Live cross-validation revealed Albertsen / Vance / Reger / Collins (legitimate older AK discipline orders, dateFiled 2017-2018) used the legacy form. Fix: widened parser + added `normalizeAkDocket` helper for the `Supreme Court No. S-NNNNN` docket form.

2. **Initial VT parser rejected bare `In Re <Name>`** — required Esq/ODC parenthetical. PRB has many older orders with bare captions; the search-level anchor on "Office of Disciplinary Counsel" already enforces context. Fix: dropped the Esq/ODC requirement; kept corporate/estate noise filters.

3. **AK "Honorable Martin C. Fallon, District Court Judge" judicial-discipline** — same caption form as bar discipline. Critical filter: reject when name contains "Honorable" / "Judge" / "Magistrate" / "Justice" / "District Court Judge".

## What's left

1. **Sibling-session check:** other open PRs from this G1c batch (if any agent-spawned in parallel for ME/MT/RI/DE/federal) — should be fine since each branch is in its own worktree.

2. **CV verification:** run `node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends` to confirm no probe regressions.

3. **G1c remaining states (per master plan):** ME, MT, RI, DE, federal. Not in this batch's scope.

## Verification

- [x] Cross-validation harness — 5 parser bugs caught at dry-run
- [x] `node --test scripts/ingest/__tests__/scrape-{sd,nd,ak,dc,vt,wy}bar-discipline.test.mjs` — 85/85 pass
- [x] `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` — clean (exit 0)
- [x] Live `--apply` against prod, INSERT counts confirmed (see Outcome table)
- [x] Anti-hallucination audit — 0 NULL/non-HTTPS rows for SD/ND/AK/DC/VT/WY
- [x] HEAD-check one source URL per state — all return CL standard 202
- [x] CI green (verify + Vercel)
- [x] PR #194 merged via `gh pr merge --squash --admin`
- [ ] CV (`node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends`) — recommended after merge

## Cascade

- **defendants (downstream):** IB reports for SD/ND/AK/DC/VT/WY defendants now surface real disciplinary history with verifiable CL links. DC is the bigger win — 711 attorneys with discipline history now live, including high-profile cases (Klayman et al).
- **future-us:** the cross-validation harness + 5-bug catch is the most reusable artifact. Anti-TN-bug pattern proven AGAIN — this is the fixture inspection that unit tests can't replace because they validate the parser's own assumptions.
- **ecosystem:** publishable pattern for any small jurisdiction where CL has ≥50 disciplinary opinions. The "small states are thin" assumption from judge-profiles G8 was wrong for bar discipline — coverage is significantly better here.
- **adjacent (G1c remaining):** ME/MT/RI/DE/federal can apply the same template. AK's docket-normalization (modern + legacy) is reusable.
- **us (Atlas):** worry-bar-discipline-pristine extended to **28 jurisdictions** (was 22 after batch 5).

No node loses. Cascade-positive.

## Cost summary

- Phase A (CL probe + fixture review): ~15 min, ~$0.50
- Phase B (6 scraper builds + tests): ~50 min, ~$3
- Phase C (cross-validation harness + 5 bug fixes): ~25 min, ~$1.50
- Phase D (6 dry-runs + 6 applies + audit): ~30 min, ~$1
- Phase E (PR + handoff): ~10 min, ~$0.50
- **Total: ~$6.50, ~2 hours real-time**

Significantly faster than batch 5 (NM/NE/MS/KS) at ~3 hours, even with 50% more states. Reused the per-sanction-query pattern, `<mark>` strip, `main()` guard, env-loader idiom, and bulk-loader skeleton from PR #191. The cross-validation harness is now part of memory and pays off every batch.

## Ready-to-paste prompt for next session

```
Continue from C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-04-27-bar-disc-batch8-outcome.md.

PR #194 merged. SD/ND/AK/DC/VT/WY shipped live (943 events, 891 attorneys, 100% HTTPS).
attorney_discipline_events now at 30,320 events / 0 NULL source_url across all jurisdictions.

Next priorities:
1. Run CV to confirm no probe regressions: node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends
2. Continue G1c remaining states per master plan: ME, MT, RI, DE, federal (and KY follow-up from docs/plans/2026-04-27-followup-ky-bar-blocked.md).
3. Pick up cleanup of worktree at C:\Users\email\projects\_worktrees\bar-disc-batch8 (still mounted post-merge).
```
