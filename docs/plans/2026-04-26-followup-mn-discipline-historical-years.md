# Follow-up: MN Bar Discipline Historical Years (2019/2020/2021)

## Scope

Current MN coverage: 102 events from 2022/2023/2024 (PR #158 merged 2026-04-26). Historical years 2019/2020/2021 are NOT in production.

## Why deferred from initial scrape

- 2019: every probed URL returns 404. No text-PDF version of the annual report at predictable paths.
- 2020-2021: PDFs that exist are image-scanned (no text layer). `pdf-parse` returns empty.
- Diagnostic log (probed 2026-04-26 via HEAD requests):
  - `https://lprb.mncourts.gov/wp-content/uploads/2020/05/2019-Annual-Report.pdf` → 404
  - `https://lprb.mncourts.gov/wp-content/uploads/2019/2019-Annual-Report.pdf` → 404
  - `https://lprb.mncourts.gov/articles/Articles/PUBLIC%20DISCIPLINE%20in%202019.pdf` → 404
  - + 4 more variants, all 404

## Candidate alternate sources

1. **`https://lro.mn.gov/for-the-public/lawyer-discipline-search/`** — Minnesota Lawyer Registration Office search interface. Different gov-site than LPRB; may expose historical records via search. Requires form-driven scraper (likely AJAX result rendering).
2. **`https://mnbars.org/`** Bench & Bar of Minnesota — quarterly columns historically published OLPR public-discipline summaries.
3. **OCR pipeline** for image-only PDFs (2020/2021 LPRB annual reports). `tesseract.js` on the rendered PDF pages → reconstruct narrative → run existing MN parser. Higher complexity but closes the gap deterministically.

## Approach when picking up

- 1 day estimate
- Try source #1 first (likely fastest — gov search APIs are usually clean)
- Fall back to source #3 (OCR) if #1 doesn't expose pre-2022 records

## Acceptance criteria

- MN events for years 2019, 2020, 2021 land in `attorney_discipline_events`
- All rows: `source_url` populated and HTTPS-verifiable
- Pre-load verification on real fixture (not synthetic) — TN parser bug class avoidance

## Out of scope

- 1996-2018: not currently a goal. If LPRB makes them recoverable, separate effort.
- Pre-1996 LPRB existed but records may be paper-only at MN State Archive.
