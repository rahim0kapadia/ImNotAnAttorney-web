# Handoff: Bar Discipline Batch 7 (ME/MT/RI/DE) — ME/RI/DE live, MT blocked

**Date:** 2026-04-27
**Parent task:** G1c bar-discipline ME/MT/RI/DE
**Worktree:** `C:\Users\email\projects\_worktrees\bar-disc-batch7` (branch `feat/bar-discipline-me-mt-ri-de`)
**Sibling sessions:** `feat/bar-discipline-sd-nd-ak-dc-vt-wy` (separate worktree, separate batch)

## Outcome

**ME / RI / DE shipped live to prod (317 events). MT documented blocker.**

| Jurisdiction | Events | Attorneys | Source coverage | Date range | Status |
|---|---|---|---|---|---|
| ME | 162 | 128 | 100% HTTPS, 0 NULL src | 2018-01-10 → 2026-04-07 | LIVE in prod |
| RI | 76 | 76 | 100% HTTPS, 0 NULL src | 2000-02-02 → 2026-03-30 | LIVE in prod |
| DE | 79 | 79 | 100% HTTPS, 0 NULL src | 1998-07-31 → 2021-05-27 | LIVE in prod |
| MT | 0 | 0 | — | — | **BLOCKED** (CL too thin + ODC JS-rendered, plan exists) |
| **Total** | **317** | **283** | **0 NULL** | | |

**Anti-hallucination audit (full table):** `attorney_discipline_events` now **29,590 events / 0 NULL source_url**. The 4 customer-facing legal-data tables remain pristine.

## Approach

**Three different pivots — one per state — based on probe results:**

1. **ME (HTML route).** Maine Board of Overseers publishes a single static HTML page with year-section tables (2000-2026) at `mebaroverseers.org/dah_schedule/court_grievance_decisions.html`. ~470 historical decisions in the page; ~163 had usable sanction text after filtering procedural rows (Receiver Appointment / Receiver Discharge etc. that classify as 'unknown'). Synthetic bar_number `me-name-<md5>` per FL convention.
2. **RI (CL route).** Rhode Island Disciplinary Board page is informational only; no listing. CourtListener `court=ri` exposes 315+ "In the Matter of <Name>" opinions with `YYYY-NNN-M.P.` dockets. Per-sanction CL queries (the established pattern from KS/NV/CT batches). bar_number = `RISC:<docket>`.
3. **DE (CL route).** Delaware ODC publishes a "Digest of Lawyer Discipline" with 782 cases at `courts.delaware.gov/odc/digest/` BUT 95%+ of the captions are anonymous ("N/A" or "In the Matter of a Member of the Bar" without a name) and the Public-only filter requires WebForms postback. CourtListener `court=del` exposes 170+ public-discipline opinions WHERE the caption includes a colon followed by the attorney name. bar_number = `DESC:<NNN,YYYY>`.
4. **MT (BLOCKED).** ODC page is Wix-built, fully JS-rendered (zero useful content in static HTML). CL `court=mont` returns only 9 PR-docket opinions (and ~4 are judicial-discipline). State Supreme Court docket search portal needs session+captcha. Scoped Playwright follow-up in `docs/plans/2026-04-27-followup-mt-bar-blocked.md`.

## Files

### New scrapers + tests + fixtures
- `scripts/ingest/scrape-mebar-discipline.mjs` (~370 lines)
- `scripts/ingest/scrape-ribar-discipline.mjs` (~330 lines)
- `scripts/ingest/scrape-debar-discipline.mjs` (~360 lines)
- `scripts/ingest/__tests__/scrape-mebar-discipline.test.mjs` (19 tests)
- `scripts/ingest/__tests__/scrape-ribar-discipline.test.mjs` (22 tests)
- `scripts/ingest/__tests__/scrape-debar-discipline.test.mjs` (21 tests)
- `scripts/ingest/__fixtures__/me-sample-live.html` (~282 KB live capture)
- `scripts/ingest/__fixtures__/ri-sample-live.json` (CL search results)
- `scripts/ingest/__fixtures__/de-sample-live.json` (CL search results)
- `docs/plans/2026-04-27-followup-mt-bar-blocked.md` (MT scoped follow-up)

### Memory updated
- `~/.claude/agent-memory/general-purpose/inaa-bar-scrapers.md` — to be updated with the ME HTML pattern + RI/DE CL anchor patterns + the DE anonymous-caption gotcha.

## What worked

1. **Live-source URL probes BEFORE writing fixtures (anti-TN-bug pattern).** Caught all four key surprises before any --apply:
   - DE truncated captions in CL search results — verified the "anonymous" first 4 results actually ARE anonymous (slug in absolute_url confirms no name in source) before treating the truncation as a parser bug.
   - RI's "In re <Name>" form for older opinions (Carden, Gelfuso) — initial draft only accepted "In the Matter of"; cross-validation showed 2 valid hits being rejected. Patched to accept both forms with a "no Member of the Bar filler" gate.
   - Maine's 5-cell row layout with malformed nested `<tr>` tags — instead of relying on tr framing, anchored the parser on consecutive groups of 5 `<td>` cells.
   - Maine's procedural noise — Receiver Appointment / Discharge orders make up >50% of HTML rows but aren't discipline events. Filter them via classify-as-unknown + drop pattern.

2. **Cross-validation harness pattern from batch 6.** Wrote a temp `_xval.mjs` that imported each scraper and ran `buildRecordFromClResult` against fixture results, dumping accept/reject decisions with reasons (docket-fail vs caption-fail vs unknown). Manual eyeball revealed the RI bug; without the harness, both the RI and DE scrapers would have shipped at 65-90% recall.

3. **Per-sanction CL queries (the established pattern).** 10 sanction-specific queries per state, anchored on caption form, with first-match-wins so we don't double-count. Same shape as MS/KS/NM/NE/ID/WV/HI/NH/UT/IA/NV/AR.

4. **Maine's HTML route avoided 700+ CL fetches.** The Board of Overseers page is one static HTTP fetch; CL would have been 10 sanction-queries × ~7 pages = 70 paginated fetches with rate-limit risk. HTML was the right surface even though CL coverage existed.

5. **`<mark>` strip on captions AND dockets.** Caught at first xval run; same defensive fix as NV's bug.

## What didn't work / pivots

1. **MT ODC page yielded zero parseable content.** Wix-built site renders the discipline list entirely client-side. `curl` returned 131 KB of font CSS and zero attorney names. Pivoted to MT Supreme Court CL query, which returned only 9 PR-docket opinions — below the 10-event threshold. Documented as blocked.

2. **DE Digest's Public-only filter is WebForms-only.** ASP.NET form requires viewstate + event-target POST submit; not URL-tractable. Pivoted to CL.

3. **DE first-pass parser rejected 7/20 fixture results as anonymous.** All 7 were genuinely anonymous (caption truncated to "...of the Bar of the Supreme Court of [the State of] Delaware" with no name; absolute_url slug confirms). DE Supreme Court redacts names in some discipline orders — the parser is correctly preserving that anonymity.

4. **Maine pre-2018 entries use `<a id="YYYY"></a>` anchors instead of `<table id="YYYY">` tables.** The page format changed circa 2018. Current parser only handles table-form rows. Pre-2018 backfill would require a second parser path; deferred — 162 events from 2018-2026 is well above the threshold.

## What's left

1. **Push branch + open PR** with this handoff in the body.
2. **Merge after CI green** via `gh pr merge --squash --admin`.
3. **MT follow-up** — pick up `docs/plans/2026-04-27-followup-mt-bar-blocked.md` in a separate session (~2-4h with Playwright route, $0 budget).
4. **CV (`node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends`)** — recommended after merge.

## Verification

- [x] `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` — clean (exit 0)
- [x] `node --test` on all 3 test files — 62/62 pass
- [x] Live cross-validation harness against current CL/HTML — parsers validated, anti-TN-bug caught (RI In-re form gap)
- [x] `--apply` ran against prod, INSERT counts confirmed:
      - ME: 128 attorneys upserted, 162 events inserted (1 dup folded into UNIQUE constraint — twin orders for same name+date+type)
      - RI: 76 upserted, 76 events inserted
      - DE: 79 upserted, 79 events inserted
- [x] Anti-hallucination audit: 0 NULL `source_url` across 29,590 events
- [x] HTTPS coverage: 100% on ME/RI/DE subset (317/317 https)
- [ ] CV recommended after merge

## Cascade

- **defendants (downstream):** IB reports for ME/RI/DE defendants now surface real disciplinary history with verifiable links (when PR #152's IB wire-up extends past CA-only)
- **future-us:** ME HTML pattern + DE anonymous-caption gotcha captured in this handoff; next state on this template won't repeat the cycle
- **ecosystem:** publishable pattern for any state where (a) CL has clean per-sanction-tagged opinions OR (b) state bar publishes a full historical discipline index as static HTML
- **adjacent (MT):** scoped Playwright plan, zero re-triage cost when picked up
- **us (Atlas):** worry-bar-discipline-pristine extended to 22+ jurisdictions

No node loses. Cascade-positive.

## Ready-to-paste prompt for next session

```
Continue from C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-04-27-bar-disc-batch7-outcome.md.

Three states (ME/RI/DE) shipped live in PR #<TBD> (317 events, 0 NULL source_url, 100% HTTPS). PR is open; merge after CI green.

Next priorities:
1. Pick up MT per docs/plans/2026-04-27-followup-mt-bar-blocked.md — Playwright route on montanaodc.org PDF, ~2-4h.
2. Continue G1c remaining states (SD/ND/AK/DC/VT/WY/federal) per master plan.
3. Run CV to confirm no probe regressions from the batch7 ingest.
```

## Cost summary

- Phase A (live URL probes + WebSearch triangulation for 4 states): ~25 min, ~$0.50
- Phase B (3 scraper builds + 62 tests + dry-runs + cross-validation harness): ~80 min, ~$2-3
- Phase C (DE caption-redaction analysis + RI In-re-form fix): ~15 min, ~$0.50
- Phase D (3 applies + audit + handoff + MT plan): ~25 min, ~$1
- **Total: ~$5, ~2.5 hours**
