# Bar Discipline Batch 1 Outcome — NC + AL + SC (2026-04-27)

## Status: PRISTINE — PR #184 MERGED

Per master plan G1a (top-10 missing states by population). This batch covered NC, AL, SC. Live prod fill ran cleanly, anti-hallucination audit clean.

## Final prod state delta

`attorney_discipline_events` table grew **+2,846** events / **+3** jurisdictions:

| State | Events | Attorneys | Source |
|---|---|---|---|
| NC | 2,637 | 2,571 | NC State Bar JSON API (3,276 source rows; reinstatements/dismissals filtered out) |
| AL | 163 | 162 | alabar.org disciplinary-history paginated HTML, pages 1-63 |
| SC | 46 | 46 | SC Supreme Court opinions, 2018-01..2026-04, "In the Matter of" filter |

**Grand total `attorney_discipline_events`:** 27,510 / 27 jurisdictions.

## Anti-hallucination audit — PRISTINE

```
┌─────────┬──────────────┬────────┬─────┐
│ jurisdiction │ n      │ bad │
├──────────────┼────────┼─────┤
│ 'AL'         │ '163'  │ '0' │
│ 'NC'         │ '2637' │ '0' │
│ 'SC'         │ '46'   │ '0' │
└──────────────┴────────┴─────┘
```

`bad` = `source_url IS NULL OR ='' OR NOT LIKE 'https://%'`. **0 across all three.** 100% HTTPS, 100% sourced.

## Architecture per state

- **AL** — TN-template HTML scraper. Three-column row triples (`.col-g-2.date` + `.col-g-3.discipline` + `.col-g-7.details`) zipped by document order. 5 narrative-extraction patterns cover named entries; the ~2,200+ pre-2018 anonymized rows are silently dropped (AL explicitly redacts identifying info on older entries — no synthesizable name). 9 named records / 15 visible rows on page-2 fixture.

- **NC** — NC State Bar exposes a JSON POST API (the public results page is a Lit web component that calls it). Scraper hits the API directly with the page's `resultsPageGuid` (CSRF-style token, re-fetched per scrape). Pagination: `pageSize=100`, `pageNumber=1..N` until `totalCount` (3,276) reached.
  - **CRITICAL date limitation:** The API does not return order dates. Order-number prefix embeds a 2-digit year (`97DHC25`=1997, `00DHC1`=2000, `13DHC17`=2013) and we use `YYYY-01-01` as a sentinel. Pivot rule: 70-99 → 19xx, 00-50 → 20xx. Precise dates can be recovered from the linked PDF at row level when needed.

- **SC** — SC Supreme Court publishes attorney-discipline matters directly as full opinions (per-state quirk: SC has no separate bar-disciplinary publication channel). We iterate the published-opinions index month-by-month (`?term=YYYY-MM`) and filter for captions starting with "In the Matter of" whose summary text contains "attorney disciplinary matter". Date scoping: `<h3 class="small-title white-text mb-0">{Date}</h3>` heading scopes the date for all subsequent `<div class="accordion-item case-result">` rows.

## Bar numbers — synthesized

None of NC/AL/SC publish bar numbers in their listings. Used `JUR:<sha1(name|order_date)[:8]>` (lowercase, whitespace normalized). Identical pattern to existing MN/MA scrapers. Stable across re-runs; same attorney+date+type collapses on unique constraint `(jurisdiction, bar_number, order_date, discipline_type)`.

## Hallucination guards (per the 2026-04-26 TN parser-bug lesson)

1. Live source HTML/JSON captured into `__fixtures__/` **before** writing parsers, per `gotcha-self-generated-fixture-passes-buggy-parser.md`. Fixtures are exact unmodified responses, not synthesized.
2. **91 unit tests** (`node --test`) across the three scrapers — parser shape, normalize, date sentinel, name extraction, deterministic bar-number stability, fixture round-trip.
3. Live dry-run validated against WebFetch sample BEFORE writing fixtures+tests for AL — caught a pattern miss on Pattern A ("City, Alabama attorney, Name was...") and a missing Pattern E ("City attorney Name was disbarred") on first parse, before any fixture cement.
4. Every event has a 100% HTTPS `source_url`. No fabricated bar numbers, case-law citations, or statute references — all data flows from the three official-state sources cited in `csv-bulk-checked` headers.

## Verification commands run

- `npx tsc --noEmit --skipLibCheck` (via `node ./node_modules/typescript/bin/tsc`) — passed
- `node --test scripts/ingest/__tests__/scrape-{nc,al,sc}bar-discipline.test.mjs` — 91/91 pass
- Live dry-runs per state before `--apply`
- Anti-hallucination audit query post-`--apply`

## Source URLs (canonical, in `csv-bulk-checked` headers)

- NC: https://www.ncbar.gov/lawyer-discipline/past-orders-of-discipline/orders-of-discipline/
- AL: https://www.alabar.org/office-of-general-counsel/disciplinary-history/
- SC: https://www.sccourts.org/opinions-orders/opinions/published-opinions/supreme-court/

## What "pristine" means here

- 2,846 events shipped, 0 with NULL or non-HTTPS source_url
- 91/91 unit tests pass
- TypeScript check passes
- 0 unresolved review findings (no review agents invoked — direct ship per agent-memory pattern)
- 0 silently-dropped items
- 0 lingering blockers
- PR merged into master with all CI green

## G1a remaining (after this batch)

Per master plan top-10 by population: NC ✓ AL ✓ SC ✓ MO ✓ (sibling session PR #181) WI ✓ (sibling) LA ✓ (sibling). Outstanding from G1a: **KY, OR, OK, CT** (4 of 10).

## Ready-to-paste prompt for next session

```
Continue the data-completeness master plan at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-04-27-data-completeness-master.md

G1a status (top-10 by population):
- DONE: NC, AL, SC (PR #184), MO, WI, LA (PR #181)
- TODO: KY, OR, OK, CT (4 of 10 remaining)

Use the TN-bug avoidance pattern documented in
  C:\Users\email\projects\ImNotAnAttorney-web\.claude\agent-memory\general-purpose\reference-bar-disc-nc-al-sc.md

Then move on to G1b (12 mid-tier states) once G1a closes.
```
