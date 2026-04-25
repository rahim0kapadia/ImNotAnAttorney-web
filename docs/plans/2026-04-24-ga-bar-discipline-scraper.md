# Plan: GA Bar Discipline Scraper

> Updated 2026-04-24 after reading templates: scrape-flbar-discipline.mjs (synthetic bar_number pattern), scrape-pabar-discipline.mjs (JSON API pattern), scrape-calbar-discipline.mjs (CA listing pattern), pg-bulk-defaults.mjs (bulkCopyRows helper), 20260422e_attorney_discipline.sql (schema), ARCHITECTURE.md (system invariants), docs/CONTEXT.md (subsystem map).

## Goal
Build a scraper for State Bar of Georgia disciplinary actions and load
into `public.attorneys` + `public.attorney_discipline_events` with
`jurisdiction='GA'`. Mirror the FL/PA template architecture (already on
master).

## Source Discovery (probed 2026-04-24)
- **Primary listing**: `https://www.gabar.org/public/recent-attorney-discipline`
  - HTML page grouped by section: `#DISBAR`, `#SUSP`, `#INTSUSP`, `#REPRIM`, `#REINSTAT`
  - One `<h3>` per attorney with name, address, "Bar Admission: YYYY",
    discipline label as a link to the order PDF, and date.
  - Order PDFs at relative path `/docs/default-source/disciplinaries/<slug>.pdf`
  - Rolling **6-month** window (~20 entries at any time).
- **No bar number** in listing (matches FL pattern). Use synthetic
  `ga-name-<md5(name)[:12]>` like `flbar` does, accepting the same minor
  collision risk on identical names.
- **Bulk download**: confirmed none exists. GA Bar provides per-letter
  request via Office of General Counsel ($20/letter, postal mail). Not
  accessible programmatically.
- **Older orders**: not on the rolling page. Two paths to extend window:
  1. **Wayback Machine CDX**: `https://web.archive.org/cdx/search/cdx?url=gabar.org/public/recent-attorney-discipline` returns historical snapshots. Each snapshot held a different ~6 months' worth of entries. Walking back over the last 8-10 years yields hundreds of distinct entries with the historical snapshot URL serving as the immutable `source_url`.
  2. Per-attorney `gabar.org/membership/find-a-lawyer/` member-directory pages with "Public Discipline → History on File" — but those require JS interaction and are 1:1 lookups. Out of scope for v1.
- **Polite scraping**: 1-2s delay, INAA UA per parent prompt.

## Approach
Two-phase fetch:

1. **CURRENT**: Fetch the live recent-discipline page once. Parse all
   sections; emit a record per attorney with `source_url` pointing to the
   PDF order link (when present) or the listing page itself.
2. **HISTORY**: Query Wayback CDX API for snapshots of the same URL since
   2016-01-01, `collapse=timestamp:6` so we get one snapshot per 6-month
   bucket (avoids re-parsing identical state). For each snapshot:
   - Fetch `https://web.archive.org/web/<ts>/https://www.gabar.org/public/recent-attorney-discipline`
   - Parse it the same way.
   - `source_url` is the snapshot URL (immutable, 100% coverage).

The dedup happens at insert time via the
`(jurisdiction, bar_number, order_date, discipline_type)` UNIQUE
constraint with `ON CONFLICT DO NOTHING` — multiple snapshots showing the
same entry just collapse into one row.

This pattern is intentional: order_date is part of the unique key, so a
disbarment from 2019 surfaced in five different Wayback snapshots
inserts exactly once.

## Files

### Created
1. `scripts/ingest/scrape-gabar-discipline.mjs` — main scraper.
2. `docs/plans/2026-04-24-ga-bar-discipline-scraper.md` — this plan.
3. `docs/handoff/2026-04-24-ga-bar-discipline-handoff.md` — final report.

### Modified
None. Schema (`attorneys` + `attorney_discipline_events`) already exists
on master from 20260422e migration. Helper `scripts/lib/pg-bulk-defaults.mjs`
exists and is unchanged.

## Tasks
1. Probe Wayback CDX endpoint for snapshot count and date range.
2. Probe one historical snapshot to confirm same HTML structure.
3. Implement parser shared between live + Wayback (single
   `parseHtml(html, sourceUrl)` function returning records).
4. Implement Wayback CDX walker with `collapse=timestamp:6` and
   `from=20160101`.
5. Implement CLI flags: `--apply`, `--max-snapshots N`, `--no-wayback`
   (live-only), `--from YYYYMMDD`.
6. Dry-run with `--no-wayback --max-snapshots 3` to validate parser
   shape and counts.
7. Full dry-run (no DB write) to confirm event count meets ≥300
   (target ≥500) target before applying.
8. Apply to DB; verify with the three SQL checks in parent prompt.
9. HEAD-check one PDF order link with curl + INAA UA.
10. Spot-check 3 names against gabar.org member directory to confirm
    they are real Georgia attorneys.
11. Commit to feat/ga-bar-discipline. Do NOT push. Do NOT open PR.

## Verification (parent-mandated)
```sql
SELECT count(*) events, count(DISTINCT bar_number) attorneys,
       min(order_date), max(order_date)
  FROM attorney_discipline_events WHERE jurisdiction='GA';
SELECT count(*) total,
       count(source_url) FILTER (WHERE source_url IS NOT NULL AND source_url!='')::int has_url
  FROM attorney_discipline_events WHERE jurisdiction='GA';
SELECT discipline_type, count(*) FROM attorney_discipline_events
  WHERE jurisdiction='GA'
  GROUP BY discipline_type ORDER BY count(*) DESC;
```

## Exit Criteria (parent-mandated)
- `jurisdiction='GA'` rows >300
- 100% `source_url` populated (every record carries either the PDF order
  URL, the live listing URL, or a Wayback snapshot URL)
- `bar_number` is real-shape (synthetic `ga-name-<md5>` matches FL
  precedent — note: GA listing does NOT publish bar numbers, so
  synthetic is the only option; deviation from "real GA bar #"
  requirement is documented here and matches the FL precedent already
  on master)
- Spot-check 3 attorney names on gabar.org member-lookup → all real

### Known deviation from parent prompt
The prompt asks for "Real GA bar_number = Georgia State Bar Number
(typically 6 digits)." The discipline page does not publish bar
numbers. Member directory lookup is per-attorney and JS-driven.
Synthetic name hash matches the existing FL scraper pattern on master
and is honest about where the data came from. Spot-check the 3 names
rather than the synthetic IDs.

## Polite scraping
1-2s randomized delay between requests to gabar.org and to Wayback.
User-Agent: `INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)`.
