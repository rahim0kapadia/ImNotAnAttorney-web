# NJ Bar Discipline Scraper

**Date:** 2026-04-25
**Branch:** `feat/nj-bar-discipline`
**Status:** SHIPPED — full corpus loaded

## Source decision

After probing the candidate NJ public-discipline endpoints, the **DRB Lookup
Portal** is the canonical source:

- **Disciplined Attorneys index** — `https://drblookupportal.judiciary.state.nj.us/DisciplinedAttorneys.aspx`
- **Letter pages (A-Z)** — `https://drblookupportal.judiciary.state.nj.us/DisciplinedAttorneyResults.aspx?k=<A-Z>`

Why this source over the alternatives:

| Source | Verdict |
|---|---|
| DRB Lookup Portal | **CHOSEN** — single-call-per-letter, full corpus since Jan 1988, real bar numbers (NJ admission ID format `NNNNN-YYYY`), stable HTML markup. |
| OAE Quarterly Discipline Reports | Quarterly PDFs back to ~2015. Lossier — has names + sanction summaries but no machine-stable bar numbers and no per-case structured fields. Not bulkable. |
| `njoag.gov/majordiscipline` | Major-discipline AG matters, not the bar discipline registry. Out of scope. |
| NJ Supreme Court order index | Per-order PDFs, no per-attorney aggregation. |
| OAE direct ethics complaints | Confidential until public discipline issues; covered by DRB once public. |

The DRB portal aggregates EVERY publicly-disciplined NJ attorney since 1988
plus pre-1988 historicals where they exist (one row from 1960 in the corpus).

## Why HTML scraping (no API)

The DRB site is ASP.NET WebForms with `__VIEWSTATE`. We probed the search and
results pages on 2026-04-25 — there is NO XHR/JSON endpoint. The full
result-set per letter is server-rendered into one HTML page. We hit each
letter once, parse with regex against stable id markers
(`gvDecisions_<idx>`, `Bar ID:`, `color: Red;`), and apply 1-2s polite
delays between letters per CLAUDE.md polite-scraping convention.

`csv-bulk-checked: none-exists — NJ DRB Lookup Portal serves HTML only.`

## Cascade map

- **Us (INAA):** NJ becomes the largest single jurisdiction in the
  attorney-discipline corpus (+4,940 events). Powers the Attorney-Vetting
  $47 SKU and the IB $997 "Opposing Counsel Red Flags" appendix for NJ
  defendants — the third-most-populous defendant pool after CA and TX.
- **Direct counterparty (NJ defendants):** instantly knowable
  attorney-history check before retaining counsel. Rahim's product
  philosophy: defendants checking their own attorney's history is the
  baseline information asymmetry we exist to fix.
- **Downstream (defendant's family):** same lookup feeds the
  family-decision context in the X-Ray ($2,497) tier.
- **Ecosystem (NJ bar):** every clean attorney looks better against the
  disciplined comparison set; reputation floor rises. NJ DRB itself
  benefits — public-record transparency is its mandate.
- **Future-us:** the same fetch+regex+stage-bulk pattern transplants to
  any state bar that publishes by-letter HTML — VA, MD, MA, CT all
  follow similar shapes. Pattern is now reusable for the next 4-5 states.
- **Adjacent players (other states' attorneys searched against same
  product):** raises pressure on every bar to maintain a public registry.
  Industry floor up.

No node loses. Cascade-positive.

## Expected counts (pre-flight)

Probe of letter A on 2026-04-25:
- 116 attorneys, 217 decisions, 18 multi-decision attorneys (~1.87 decisions
  per attorney average).

Extrapolated to 26 letters: ~3,000 attorneys / ~5,500 decisions.

## Smoke-test results

### Letter A only — `--apply --letters A`
```
[drb] letter A: 216 decision rows
[db] attorneys upserted: 116
[db] discipline events inserted: 195
```

Spot-checked: 5 sample rows verified against live DRB page (AAROE / ABASOLO /
ABDALLAH / ABDELLAH x2). All correct.

### Full 26-letter run — `--apply`

```
collected 5261 decision rows
attorneys upserted: 3131
discipline events inserted: 4940
```

(5,261 raw decisions − 321 collapsed by `(jurisdiction, bar_number,
order_date, discipline_type)` unique constraint when an attorney has
multiple decisions of the same type on the same date. This is the schema
de-dup; expected behavior.)

## Coverage verification

```sql
SELECT count(*) total,
       count(*) FILTER (WHERE source_url IS NOT NULL AND source_url<>'') with_source,
       count(*) FILTER (WHERE order_url  IS NOT NULL) with_order,
       count(*) FILTER (WHERE bar_number IS NOT NULL) with_bar
FROM attorney_discipline_events WHERE jurisdiction='NJ';
```
Result: `total=4940, with_source=4940, with_order=4940, with_bar=4940` —
**100% on every required field.** No fabricated bar numbers; rows missing
`bar_admin_no` are skipped at parse time per the schema's `NOT NULL`
constraint.

## Discipline-type histogram

| Type | Count |
|---|---|
| public_reprimand | 1,589 |
| suspension | 1,335 |
| disbarment | 842 |
| admonishment | 700 |
| reinstatement | 382 |
| dismissed | 74 |
| unknown | 17 |
| disability_inactive | 1 |

The 17 "unknown" residuals are all "OTHER ..." or "GRANT MOTION" sentinel
labels that have no canonical normalization (e.g. `OTHER M/FINAL DIS`,
`GRANT MOTION M/RECONSIDERATION`). Force-mapping them would create false
signal; left honest.

## Year histogram

Range 1960 — 2026 (current). Most active: 2002 (239), 2018 (192), 2017
(178), 2020 (174), 2017 (178). 42 events in 2026 YTD.

## Edge cases handled

1. **Two-column table layout** — Each `gvDecisions` table is a 2-cell-per-`<tr>`
   grid (left + right cells). Parser iterates `<td>` cells, not `<tr>` rows,
   so both cells contribute one decision each. Without this fix the parser
   missed ~32% of decisions on every letter.
2. **Intermittent empty pages** — DRB ASP.NET app served empty result lists
   on letters B and C during one full run. Added `fetchLetterWithRetry` —
   3 attempts with exponential backoff, treats `<5KB body OR no "Bar ID:"`
   as empty. Letters X (legitimately empty) only retry once before moving
   on. Verified: subsequent runs of B + C return full data.
3. **DRB sanction abbreviations** — Source uses `PUB REP` (Public Reprimand),
   `RESTORE` (reinstatement), `PRIV REP` (private reprimand, historical
   admonition), `LIC. REVOKED` (= disbarment effect), `INDETERMINATE SUSP.`,
   `TIME SERVED`. Patterns documented inline in `DISCIPLINE_PATTERNS`.
4. **Multiple decisions per attorney** — Schema unique key
   `(jurisdiction, bar_number, order_date, discipline_type)` collapses
   same-day same-type rows (e.g. an attorney with two reprimands entered
   on the same hearing date). Different types on same date co-exist.
5. **Attorney admission_date from bar number** — DRB bar numbers are
   `NNNNN-YYYY` where YYYY is the admission year; we derive
   `attorneys.admission_date = YYYY-01-01` (day-precision unknown from
   this source).

## Files

- `scripts/ingest/scrape-njbar-discipline.mjs` — the scraper, 360 lines.
- `docs/plans/2026-04-25-nj-bar-discipline-scraper.md` — this plan.

## Hard-rule compliance

| Rule | Status |
|---|---|
| Polite UA 1-2s/req | ✓ randomized 1000-2000ms between letters |
| 100% source_url coverage | ✓ 4,940 / 4,940 |
| Real bar numbers — NOT NULL | ✓ DRB-published, never fabricated |
| Per-jurisdiction staging | ✓ `_stg_attorneys_nj` + `_stg_discipline_nj` |
| `bulkCopyRows` for inserts | ✓ no per-row INSERT in any loop |
| Smoke pattern (1 page → apply 1 page → full) | ✓ all stages clean |
| No third-party email | ✓ |
| No mods to other jurisdictions | ✓ baseline 9 jurisdictions / 10,502 events untouched |

## Final state

Before:  9 jurisdictions, 10,502 events.
After:  10 jurisdictions, 15,442 events. NJ alone = 4,940 events (now the
largest single jurisdiction in the corpus, ahead of PA at 3,027).
