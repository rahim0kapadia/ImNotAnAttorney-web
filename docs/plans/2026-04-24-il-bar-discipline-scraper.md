# Plan: IL Bar (ARDC) Discipline Scraper

**Date:** 2026-04-24
**Owner:** parent session (this is a sub-agent task)
**Branch:** `feat/il-bar-discipline` (worktree at `C:\Users\email\projects\il-bar-work`)
**Template:** `scripts/ingest/scrape-pabar-discipline.mjs` (PA JSON API win)
**Pattern:** `cl-bulk-data-defensive #18` (COPY FROM STDIN via `bulkCopyRows`)

## Source Discovery

ARDC site (https://www.iardc.org/) is server-rendered ASP.NET. No bulk CSV; no JSON API documented. Three candidate ingestion surfaces:

| Surface                                                   | Coverage                  | Shape                            |
|-----------------------------------------------------------|---------------------------|----------------------------------|
| `/RecentSupremeCourtCases`                                | ~92 cases, Sep 2024–Mar 2026 | server-rendered HTML, structured: `In re <Name>` headings + ARDC#, date, location, summary |
| `/Lawyer/RecentDisciplinaryActions`                       | ~26 PDFs, last 2 years    | links to PDFs; no structured fields |
| `/DisciplinarySearch` (Case Research)                     | full historical archive   | ASP.NET `<form>` POST with `__RequestVerificationToken`; returns HTML results table; no JSON |

We need **500+ events**. The summaries page (`/RecentSupremeCourtCases`) is the highest-quality structured source for ~2 years, but only yields ~92. To clear the 500 bar, we ALSO scrape `/DisciplinarySearch` (POST form with `proceedingTypes=Disciplinary` plus a year range) for older years (2010-2024). That endpoint returns server-side HTML with respondent name, ARDC #, decision date, disposition, and links to individual orders.

Per the rules:
- We probe `/RecentSupremeCourtCases` first (no auth, no token, fast). It alone provides ~92 events with full ARDC# coverage and clean structure.
- We extend with `/DisciplinarySearch` POST loop year-by-year (2010..2024) to push past 500. Each results page lists rows with respondent + ARDC # + decision date + disposition + a link to the order PDF.

If `/DisciplinarySearch` POST fails or rate-limits, we fall back to scraping per-year `/Lawyer/RecentDisciplinaryActions`-style PDF index, OR we accept the ~92-row corpus from summaries (still ships, but rerun nightly via a cron extension in a follow-up). The exit criterion (500+ rows) is the gate.

## Output Schema

- `attorneys`: `(jurisdiction='IL', bar_number=<real ARDC #>, full_name, first_name, last_name, city, source_url)`. UNIQUE `(jurisdiction, bar_number)`.
- `attorney_discipline_events`: `(attorney_id, jurisdiction='IL', bar_number, full_name, order_date, effective_date, discipline_type, discipline_raw, violation_summary, source_url)`. UNIQUE `(jurisdiction, bar_number, order_date, discipline_type)`. `ON CONFLICT DO NOTHING`.
- `discipline_type` enum: `disbarment | suspension | probation | public_reprimand | resignation_with_charges | interim_suspension | reinstatement | disability_inactive | sanction | unknown`.

## Files to Create

1. `scripts/ingest/scrape-ilbar-discipline.mjs` — full scraper, loads inline.
2. `docs/plans/2026-04-24-il-bar-discipline-scraper.md` — this file.

Staging tables (created by the script): `_stg_attorneys_il`, `_stg_discipline_il`.

## Files to Modify

None outside `scripts/ingest/` and `docs/plans/`.

## Hard Constraints (per `~/.claude/rules/no-hallucinated-legal-data.md` + `cl-bulk-data-defensive`)

1. 100% `source_url` coverage — NO synthesized URLs.
2. Real ARDC `bar_number` required (NOT NULL). Skip rows missing it (do not fabricate).
3. File header citation block: `Template:` PA scraper / `Pattern:` cl-bulk-data-defensive #18 / `csv-bulk-checked: none-exists — ARDC publishes no bulk CSV`.
4. `bulkCopyRows` from `scripts/lib/pg-bulk-defaults.mjs`. Per-row INSERT in loop = banned.
5. Session-level Postgres settings via `createBulkClient`: tier-safe `work_mem`, `statement_timeout='30min'`, `idle_in_transaction_session_timeout='5min'`, tcp_keepalives. Port 5432.
6. Polite delay 1-2s between page fetches. UA = `INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)`.
7. Cap concurrency at 1 (sequential scrape). No parallel page fetches.

## Numbered Tasks

1. Probe `/DisciplinarySearch` form structure (input names, POST endpoint, results-row HTML pattern). Use a one-off probe script in `.tmp-*.mjs`.
2. Probe `/RecentSupremeCourtCases` HTML structure for the heading/respondent/ARDC# parser.
3. Implement `scrape-ilbar-discipline.mjs`:
   - CLI: `--apply` (default dry-run), `--start-year`, `--end-year`, `--source` (`recent` | `search` | `both`, default `both`).
   - Phase 1: parse `/RecentSupremeCourtCases` (single fetch, ~92 rows).
   - Phase 2: loop `/DisciplinarySearch` POST per year (or per multi-year window) to extend coverage to 500+.
   - Normalize discipline_type via the same regex table as the PA scraper (extended for IL phrasing).
   - Stage rows in `_stg_attorneys_il` / `_stg_discipline_il`, then upsert via JOIN into `attorneys` + `attorney_discipline_events`.
   - Drop staging at end.
4. Run dry-run verbosely; spot-check 5 rows.
5. Run `--apply`. Verify counts via the three SQL queries in the prompt.
6. HEAD-check 1 sample `source_url` with curl.
7. Commit on `feat/il-bar-discipline`. Do NOT push.
8. Report branch + SHA + counts to parent.

## Cascade

- us / Atlas: jurisdiction=IL added to attorney-vetting product surface; +1 state coverage.
- direct counterparty (defendants in IL): IL bar lookup product becomes viable.
- downstream (Attorney-Vetting $47 SKU): coverage parity with PA/CA/FL/TX/NY closes the IL gap.
- ecosystem (other state bar scrapers): the `_stg_*_<jurisdiction>` pattern + PA-shape scaffold becomes a 6th proof-point — future state scrapers reuse the recipe verbatim.
- future-us: scraper is idempotent (`ON CONFLICT DO NOTHING`), so cron-scheduling is a follow-up that doesn't change the script.
- ARDC: light, polite, identified UA; we are not stressing their infra. Public records — no extraction concern.

No node loses.

## Exit Criteria

`SELECT count(*) FROM attorney_discipline_events WHERE jurisdiction='IL'` >= 500
AND `count(source_url)` = `count(*)` (100% URL coverage)
AND every row's `bar_number` is a real ARDC ID (spot-check 3 on iardc.org).

If the 500-row gate fails after both phases, ship what we have, document the gap in the handoff, and queue a Phase 3 (per-year PDF-index scrape) as follow-up.
