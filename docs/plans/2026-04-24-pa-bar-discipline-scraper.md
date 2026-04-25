# Plan: Pennsylvania Attorney Discipline Scraper

> Provided by parent session 2026-04-24. Stored here per FEATURE triage gate.

## Goal
Add Pennsylvania attorney discipline events to `attorneys` + `attorney_discipline_events`.
Target: ~500-1500 PA events. Powers the Attorney-Vetting $47 SKU (next-largest unclaimed
state by population, ~12.9M).

## Source
https://www.padisciplinaryboard.org/for-the-public/search-recent-discipline
JS-driven; numbered pagination uses `javascript:;` (no URL nav). Requires Playwright.

## Files

### Created
- `scripts/ingest/scrape-pabar-discipline.mjs` — main scraper
- `.tmp-pa-probe.mjs` — one-off site probe (not committed)
- `docs/plans/2026-04-24-pa-bar-discipline-scraper.md` — this file

### Read-only references
- `scripts/ingest/scrape-calbar-discipline.mjs` — Playwright + UPSERT template
- `scripts/ingest/scrape-flbar-discipline.mjs` — DISCIPLINE_PATTERNS regex
- `scripts/lib/pg-bulk-defaults.mjs` — bulkCopyRows helper
- `supabase/migrations/20260422e_attorney_discipline.sql` — schema (do NOT modify)

## Tasks

1. Probe live PA search page with Playwright → identify form controls, page-size
   dropdown, table column order, pagination control.
2. Implement `scripts/ingest/scrape-pabar-discipline.mjs` with required headers:
   - `// csv-bulk-checked: none-exists — PA Disciplinary Board search is JS-driven, no CSV/API, confirmed 2026-04-24`
   - `// Template: scripts/ingest/scrape-calbar-discipline.mjs`
   - `// Pattern: cl-bulk-data-defensive #18`
3. Use `page.$$eval` to extract rows; iterate via `page.click` on Next link.
4. Map "Action" column to `discipline_type` enum via DISCIPLINE_PATTERNS.
5. Staging tables: `_stg_attorneys_pa` / `_stg_discipline_pa`; UPSERT into
   `public.attorneys` + `public.attorney_discipline_events`.
6. Smoke test: `--max-pages 2 --apply` (target 50-100 rows).
7. Full `--apply`. Stream log to
   `C:/Users/email/projects/ImNotAnAttorney/.tmp-pabar-full.log`.
8. Verify counts and discipline_type histogram.
9. Commit on `feat/pa-bar-discipline`. Do NOT push or open PR.

## Hard constraints
- `bar_number` from PA Attorney ID Number column (NOT NULL); skip rows missing it.
- Polite 1-2s/page delay; Playwright headless; UA
  `INAA-Crawler/1.0 (+https://imnotanattorney.com; contact: noreply-legal@inaa.com)`.
- Use `bulkCopyRows` from `scripts/lib/pg-bulk-defaults.mjs` (cl-bulk-data-defensive #18).
- `jurisdiction='PA'` on every row.
- If Cloudflare / bot-detection blocks Playwright: screenshot, log, Telegram Rahim,
  do NOT brute-force.
