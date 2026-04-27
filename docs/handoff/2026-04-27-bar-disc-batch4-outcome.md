# Bar Discipline Batch 4 (UT/IA/NV/AR) — Outcome

**Date:** 2026-04-27
**Parent task:** G1b in master plan (data-completeness)
**Worktree:** `C:\Users\email\projects\_worktrees\bar-disc-batch4`
**Branch:** `feat/bar-discipline-ut-ia-nv-ar`

## Status: 4/4 STATES LIVE — PRISTINE

| State | Events | Attorneys | Date range | Source |
|---|---|---|---|---|
| AR | 227 | 165 | 2012-11-29 → 2026-03-18 | arcourts.gov Drupal Views index + detail pages |
| IA | 116 | 116 | 2005-11-18 → 2026-03-20 | CourtListener `court=iowa` (Iowa Sup. Ct. Att'y Disciplinary Board v.) |
| NV | 259 | 258 | 1992-08-20 → 2025-08-28 | CourtListener `court=nev` (In re Discipline of …) |
| UT | 17  | 17  | 2004-10-01 → 2023-07-20 | CourtListener `court=utah` (OPC v. … / In re Discipline of …) |
| **Total** | **619** | **556** | | |

`attorney_discipline_events` global table now: **28,874 events / 39 jurisdictions / 0 NULL source_url**.

## Anti-hallucination audit — PRISTINE

```
batch-4 audit:
  AR: total=227  bad=0  attorneys=165  100% HTTPS
  IA: total=116  bad=0  attorneys=116  100% HTTPS
  NV: total=259  bad=0  attorneys=258  100% HTTPS
  UT: total=17   bad=0  attorneys=17   100% HTTPS
ALL CLEAR
```

`bad` = `source_url IS NULL OR ='' OR NOT LIKE 'https://%'`. **0 across all four states.**

## Files shipped

- `scripts/ingest/scrape-arbar-discipline.mjs` (~612 lines)
- `scripts/ingest/scrape-iabar-discipline.mjs` (~410 lines)
- `scripts/ingest/scrape-nvbar-discipline.mjs` (~500 lines)
- `scripts/ingest/scrape-utbar-discipline.mjs` (~430 lines)
- `scripts/ingest/__tests__/scrape-{ar,ia,nv,ut}bar-discipline.test.mjs` — 102 unit tests, all green
- `scripts/ingest/__fixtures__/{ar-detail-sample-live.html, ar-sample-live.html, ar-sample-live-page1.html, ia-sample-live.html}` — verified-live captured fixtures (anti-TN-bug)

## Approach (per state)

### AR — Drupal Views HTML scraper (gold-standard structured data)
- Index page `arcourts.gov/professional-conduct/opinions` paginated `?page=N` (0-indexed). 6 pages × 50 rows = 272 unique opinions.
- Per-row `<td class="views-field views-field-XXX">` zipped 5 cells per row in document order (title-link / given-name / city / state / date-filed).
- Detail-page enrichment via `<div class="field field--name-field-NNN">` markers extracts `bar_number`, `given-name`, `last-name`, `city`, `state`, `zip-code`, `disciplinary-type`, `case-number`, `date-filed` (from `<time datetime="…">`), and PDF `attachment` URL. **AR publishes real bar numbers** — 165 unique attorneys with structured `AR:<digits>` IDs (no synthesis).
- `reinstatement` rows skipped per existing TN/MO/MN convention (re-admission is not a discipline event).
- HTTP→HTTPS upgrade applied to PDF/order URLs.
- 45 of the 272 opinions return non-discipline values (reinstatements, repeats); 227 net events.

### IA — CourtListener bulk surface (`court=iowa`)
- Per-sanction CL queries anchored on `"Iowa Supreme Court Attorney Disciplinary Board"` caption + sanction term.
- 406+ matching opinions on CL; 116 unique events after caption-strip + de-dupe by `(bar_number, order_date)` key.
- Caption uniformly `Iowa Supreme Court Attorney Disciplinary Board v. <Respondent>` — clean strip yields a Title-Cased name.
- Reversed captions (X v. Disciplinary Board — reinstatement appeals) are rejected.
- Docket format `YY-NNNN` (e.g. `25-1787`); bar_number = `IA:25-1787`.
- Iowa OPR official site is an Oracle APEX form requiring session-based postback — CL is the bulk surface.

### NV — CourtListener bulk surface (`court=nev`)
- Caption variants: `In re Discipline of <Name>`, `In Re: Discipline Of <Name>`, `In re Resignation of <Name>`, `In Re: Reciprocal Discipline of <Name>`.
- Reinstatements (`In re Reinstatement of …`) are flagged and rejected.
- ADKT dockets (rule-change matters) are rejected by `isNvDiscipDocket`.
- 5- to 6-digit numeric dockets; bar_number = `NV:<docket>`.

### UT — CourtListener bulk surface (`court=utah`)
- Caption variants: `OPC v. <Name>`, `Office of Professional Conduct v. <Name>`, `In re Discipline of <Name>`, `In the Matter of the Discipline of <Name>`, `Discipline of <Name>` (bare), `Utah State Bar v. <Name>`.
- Reversed captions (X v. OPC / Office of Prof'l Conduct / Utah State Bar — reinstatement/appeal cases) are rejected.
- Docket format `Case No. NNNNNNN` (8-digit YYYYMMNN-style); the `Case No. ` prefix is stripped before validation. Most matters fall within 6-9 digits.
- The Utah Bar publishes the `Discipline Corner` feature in monthly Bar Journal PDFs at `utahbar.org/opc` — pre-2010 issues are image-only and OCR-required. CL is the structured bulk surface.

## Hallucination guards (anti-TN-bug protocol)

1. **Live source URL probes BEFORE writing parsers** — caught the `<mark>`-tag-on-caption surprise (NV initial dry-run returned 0 records because every `In re Discipline` caption came back as `<mark>In Re: Discipline</mark> Of …`; fixed by stripping `<\/?mark>` before prefix match).
2. **Per-sanction CL queries** so each result's `r.opinions[0].snippet` is anchored on sanction language. Top-level `r.snippet` is empty in CL v4.
3. **`<mark>` tag strip** applied to BOTH `caseName` and `docketNumber` before any parsing — same defensive pattern as OK PR #185.
4. **Caller-asserted sanction type** (vs regex-over-snippet): the per-sanction query said "disbarment" → result is tagged `disbarment` even if the snippet text also mentions "suspension" (often the prior sanction).
5. **`main()` import-guard via `pathToFileURL(process.argv[1] ?? '').href`** — prevents `node --test` from importing the module's pure helpers and triggering live CL fetches during test runs (caught at first test pass: AR's old `pathToFileURL(__filename).href` self-comparison evaluated true and ran main()).
6. **102 unit tests** (`node --test`, parser shape, normalize, docket validation, caption strip across all variants, `<mark>`-stripped roundtrip, reversed-caption rejection, build-record sanity) — **102/102 pass, 0 fail**.

## CL rate-limit handling

- `COURTLISTENER_TOKEN` env (already in `.env.local`) bumps rate ~10x. Without it, the CL search returns 429 within the first sanction-query cycle.
- 8-attempt backoff capped at 60s per attempt (`baseMs = Math.min(60000, 3000 * 2^(attempt-1))`).
- Polite 800-1600 ms randomized delay between CL pages.

## Verification

- [x] `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck` — clean
- [x] `node --test scripts/ingest/__tests__/scrape-{ar,ia,nv,ut}bar-discipline.test.mjs` — 102/102 pass
- [x] Live dry-runs per state validated row counts before `--apply`
- [x] `--apply` ran against prod, INSERT counts confirmed:
      - AR: 165 attorneys upserted, 227 events inserted
      - IA: 116 attorneys upserted, 116 events inserted
      - NV: 258 attorneys upserted, 259 events inserted
      - UT: 17 attorneys upserted, 17 events inserted
- [x] Anti-hallucination audit: 0 NULL `source_url` across 619 new + 28,874 total
- [x] HTTPS coverage: 100% on UT/IA/NV/AR subset (619/619 https)

## Cascade

- **defendants (downstream):** IB reports for AR/IA/NV/UT defendants now surface real disciplinary history with verifiable arcourts.gov / CourtListener links.
- **future-us:** the `<mark>`-strip caption-parse pattern + `pathToFileURL(process.argv[1] ?? '')` import-guard idiom captured in 4 new scrapers; next CL-backed state inherits.
- **adjacent (other CL-backed states):** Reusable per-sanction template; OK/CO/CT/OR/IA/NV/UT all share the same shape now.
- **us (Atlas):** worry-bar-discipline-pristine extended from 35 → 39 jurisdictions (was 22 after batch 3, +13 from batches 5/6).
- No node loses. Cascade-positive.

## Cost / time

- WebSearch + WebFetch + live URL probes for source coverage: ~10 min
- Existing AR/NV scrapers reviewed; bug found in NV (missing `<mark>` strip in `parseCaseName`); fix shipped: ~5 min
- IA + UT scrapers built from OK/NV template: ~25 min
- 4 test files (102 tests): ~15 min
- 4 concurrent `--apply` runs against prod (NV ~2min, IA ~10min, UT ~3min, AR ~5min real): ~10 min wall (concurrency)
- Audit + handoff + commit: ~5 min
- **Total: ~70 min**, $0 paid services
