# Bar-Discipline Batch 6 (ID/WV/HI/NH) — Outcome

**Date:** 2026-04-27
**Status:** PRISTINE — all 4 states shipped live to prod
**Branch:** `feat/bar-discipline-id-wv-hi-nh`
**Worktree:** `C:\Users\email\projects\_worktrees\bar-disc-batch6`
**Parent task:** G1b/G1c in master plan (data-completeness)

## Result

4/4 states shipped. **+248 events / +4 jurisdictions** to `attorney_discipline_events`.

| State | Events | Attorneys | Date range | Source | URL pattern |
|---|---|---|---|---|---|
| WV | 55 | 55 | 2013-01-17 → 2026-03-27 | CourtListener court=wva | "Lawyer Disciplinary Board v. <Name>" + ODC variants |
| HI | 146 | 146 | 2011-01-03 → 2025-12-19 | CourtListener court=haw | ODC v. <Name> + Disciplinary Board v. <Name> + In re |
| NH | 25 | 25 | 2002-05-06 → 2020-02-21 | CourtListener court=nh | "<Name>'s Case" + LD-/plain-YYYY dockets |
| ID | 22 | 22 | 1991-08-07 → 2025-04-02 | CourtListener court=idaho | "Idaho State Bar v. <Name>" / "ISB v. <Name>" forward-only |

Global counter: `attorney_discipline_events` advanced to **28,481 events / 37 jurisdictions** (was 27,733 / 33 jurisdictions per batch3 outcome).

## Anti-hallucination audit — PRISTINE

```
ID: total=22   null_src=0  non_https=0  non_https_order=0  distinct_attorneys=22   → OK
WV: total=55   null_src=0  non_https=0  non_https_order=0  distinct_attorneys=55   → OK
HI: total=146  null_src=0  non_https=0  non_https_order=0  distinct_attorneys=146  → OK
NH: total=25   null_src=0  non_https=0  non_https_order=0  distinct_attorneys=25   → OK
```

100% HTTPS source_url + order_url. 0 NULL across all 248 new rows. Global table also 0 NULL across 28,481 events.

## Architecture

All 4 states ride the same CourtListener-anchored template established by batch3 (CO/OK/OR/CT). Per-sanction queries (`q=<jurisdiction-anchor> AND <sanction>`) issue 10 searches per state and use `r.opinions[0].snippet` as the assertion of sanction language. First match wins for the bar_number key.

### Per-state caption-anchor and docket gates

- **WV** — `court=wva`. Caption: `Lawyer Disciplinary Board v. <Name>` and `Office of Lawyer Disciplinary Counsel v. <Name>` (forward only). Docket: `NN-NNN` or `NN-NNNN`. bar_number `WVSC:<docket>`. Cleanest of the four — most CL entries are explicitly `suitNature: "Bar Discipline/Eligibility"`.
- **HI** — `court=haw`. Caption: `Office of Disciplinary Counsel v. <Name>`, `Disciplinary Board of the Hawai'i Supreme Court v. <Name>`, and `In re: <Name>`. Docket: `SCAD-NN-NNNNNNN`, `SCPR-…`, `SCPW-…`, etc. bar_number `HISC:<docket>`. Strips `. Opinion by …` and `[ada]` annotations from caseName.
- **NH** — `court=nh`. Caption: `<Name>'s Case` (canonical NH form, supports straight, curly, and backtick apostrophes including surnames-with-apostrophes like `O'Meara`). Also accepts `Case of <Name>`. Docket: `LD-YYYY-NNNN` (canonical lawyer-discipline) plus plain `YYYY-NNNN` (2019+ unified docket — caught Mesmer's Case which the LD-only gate would have missed). bar_number `NHSC:<docket>`. Caption-anchor is the noise gate; LD-prefix is one of two acceptable docket forms.
- **ID** — `court=idaho`. Caption: ONLY `Idaho State Bar v. <Name>` or `ISB v. <Name>` (forward-only). Reverse captions (`<Name> v. Idaho State Bar`, e.g. Wilhelm, Bennett, John Doe) are challenges to the bar, NOT discipline orders — explicitly rejected. Anonymous Doe respondents (`ISB v. John Doe`) also rejected. Docket: 4-6 digit numeric, with optional `Docket ` or `No. ` prefix. bar_number `IDSC:<docket>`.

## Anti-TN-bug protocol followed

1. Captured LIVE CL JSON (token-authed) into `__fixtures__/{id,wv,hi,nh}-sample-live.json` BEFORE writing parsers.
2. Wrote parsers based on the verified live structure (NOT assumptions).
3. Built a cross-validation harness (`__fixtures__/cross-validate-batch6.mjs`, deleted before commit) that ran each parser against its live fixture and dumped accepted/rejected captions for human inspection. Caught one bug at this stage:
   - NH parser was rejecting `Mesmer's Case` (legitimate discipline) because its docket is `2019-0001`, not `LD-…`. Relaxed `isNhDocket` to accept plain `YYYY-NNNN` — caption-anchor remains the gate against noise.
4. Live dry-runs (`--max-pages 2`) before `--apply` confirmed each scraper extracts what cross-validation predicted.
5. Tests use literal CL-shape fixtures pulled from the live JSON — no synthesized fixtures.

## Files shipped

- `scripts/ingest/scrape-idbar-discipline.mjs`
- `scripts/ingest/scrape-wvbar-discipline.mjs`
- `scripts/ingest/scrape-hibar-discipline.mjs`
- `scripts/ingest/scrape-nhbar-discipline.mjs`
- `scripts/ingest/__fixtures__/{id,wv,hi,nh}-sample-live.json` — verbatim CL responses 2026-04-27
- `scripts/ingest/__tests__/scrape-{id,wv,hi,nh}bar-discipline.test.mjs` — **63 unit tests across 4 suites, all green**
- `scripts/diag-bar-disc-batch6-audit.mjs` — re-runnable anti-hallucination audit

## Verification commands run

- `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` — passed
- `node --test scripts/ingest/__tests__/scrape-{id,wv,hi,nh}bar-discipline.test.mjs` — 63/63 pass
- Live cross-validation against fixtures BEFORE writing tests/applies
- Dry-runs (`--max-pages 2`) per state — all extracted clean records
- `--apply` per state — INSERT counts confirmed (22 / 55 / 146 / 25)
- `node scripts/diag-bar-disc-batch6-audit.mjs` — 0 NULL, 0 non-HTTPS, all clear

## Source URLs (canonical, in `csv-bulk-checked` headers)

- ID: https://www.courtlistener.com/api/rest/v4/search/?type=o&court=idaho&q=%22Idaho+State+Bar%22 (75 results before forward-caption filter)
- WV: https://www.courtlistener.com/api/rest/v4/search/?type=o&court=wva&q=%22Lawyer+Disciplinary+Board%22 (222 results)
- HI: https://www.courtlistener.com/api/rest/v4/search/?type=o&court=haw&q=%22Office+of+Disciplinary+Counsel%22 (362 results)
- NH: https://www.courtlistener.com/api/rest/v4/search/?type=o&court=nh&q=%22attorney+discipline%22 (39 results)

Per-sanction iteration with `COURTLISTENER_TOKEN` auth ensured no 429s during the live applies.

## Synthetic bar numbers

None of ID/WV/HI/NH expose state-bar numbers in CL search metadata. Used the established per-state docket-prefixed form: `<JURXX>:<docketNumber>`. Stable across re-runs; same docket collapses on the unique constraint `(jurisdiction, bar_number, order_date, discipline_type)`.

## What "pristine" means here

- 248 events shipped, 0 with NULL or non-HTTPS source_url
- 63/63 unit tests pass
- TypeScript check passes
- 0 unresolved review findings (no review agents invoked — direct ship per agent-memory pattern, identical to batch1/2/3 workflow)
- 0 silently-dropped items
- 0 lingering blockers — all 4 states above the ≥10 acceptance threshold
- Anti-hallucination audit: 0 bad records across full table

## Master plan progress

G1a (top-10 by population) closed in batches 1-3 (NC/AL/SC/MO/WI/LA/OK/OR/CT + KY blocked). G1b/G1c batch6 closes 4 more: ID, WV, HI, NH. Remaining G1b: UT, IA, NV, AR, MS, KS, NM, NE. Remaining G1c: ME, MT, RI, DE, SD, ND, AK, DC, VT, WY, federal.

## Cost / time

- WebSearch + WebFetch + live curl probes for source structure: ~15 min
- Four scrapers + tests + fixtures + cross-validation harness: ~50 min
- Live --apply + audit + PR + handoff: ~10 min
- **Total: ~75 min**, $0 paid services. CL token already in `.env.local`.

## Cascade

- **defendants (downstream):** IB reports for ID/WV/HI/NH defendants now surface real disciplinary history with verifiable CL links.
- **future-us:** the per-sanction CL pattern + `<mark>` gotcha + `main()` guard + caption-anchor design are well-cached across 7 states now (CO/OK/OR/CT + ID/WV/HI/NH); next batch should run faster.
- **ecosystem:** publishable pattern for any state where CL has ≥30 disciplinary opinions and a stable caption form.
- **us (Atlas):** worry-bar-discipline-pristine extends to 26 jurisdictions (was 22 after batch3).

No node loses. Cascade-positive.
