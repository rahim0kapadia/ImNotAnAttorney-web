# MN Bar Discipline Historical Years — 2026-04-26 Outcome

## Status: BLOCKED-WITH-FOLLOWUP-PLAN

No new rows added. No PR created. Investigation produced a follow-up
plan with concrete unblock paths. See:
`docs/plans/2026-04-27-followup-mn-historical-blocked.md`

## Summary

Prior plan
(`docs/plans/2026-04-26-followup-mn-discipline-historical-years.md`)
estimated 1 day. Investigation found:

1. The PDF URLs the prior plan probed all 404'd because they were on
   `lprb.mncourts.gov` — the actual live archive is on
   `olpr.mncourts.gov` (different sub-domain). All three historical
   PDFs (2019/2020/2021) return HTTP 200 from the OLPR domain.
2. 2 of 3 PDFs are image-only (783 / 801 bytes of extractable text
   each, just page-break markers). Need OCR.
3. The 1 text-extractable PDF (2021, CY2020 data) uses a TWO-COLUMN
   attorney-roster layout. pdf-parse linearizes it in a way that
   interleaves discipline categories. Loading without
   column-disambiguation = fabricated `discipline_type` ~ 50% of
   the time, violating the no-hallucinated-legal-data hard rule.
4. Lawyer-search alt source (`lawyersearch.mncourts.gov`) is
   per-attorney lookup only — no browse, no year filter.
5. mnbars.org alt source returns 403 to scripts and is a magazine
   archive, not structured records.

## Rows added

**Zero.** The session did not write to the database. No `--apply` run
ever happened.

## Source URL pattern (for next session)

OLPR domain instead of LPRB:
- `https://olpr.mncourts.gov/wp-content/uploads/2024/04/2019-Annual-Report_compressed.pdf` (CY2018)
- `https://olpr.mncourts.gov/wp-content/uploads/2024/04/2020-Annual-Report_compressed.pdf` (CY2019)
- `https://olpr.mncourts.gov/wp-content/uploads/2024/04/2021-Annual-Report_compressed.pdf` (CY2020)

Annual-reports index page:
`https://olpr.mncourts.gov/about/annual-reports/`

## PR number

None. Worktree exists at `C:\Users\email\projects\_worktrees\mn-historical`
on branch `feat/mn-bar-discipline-historical` containing only the
follow-up plan. Will commit + ship as a single docs PR.

## Audit result

N/A (no `--apply` run). Existing prod state unchanged: 102 MN events
covering CY2021-2023.

## Why blocked-with-followup-plan, not "ship 2021 only"

- Schema enforces `discipline_type NOT NULL` and includes it in the
  unique key.
- A best-guess discipline_type for the two-column 2021 layout would
  fabricate legal claims in customer-facing IB report rendering.
- Per
  `~/.claude/rules/no-hallucinated-legal-data.md`: "Verify with stored
  URL or delete." Fabricated discipline categories have no
  verification URL — the URL points to a PDF showing both categories
  but does not authoritatively say which attorney got which one
  without column-aware parsing.

## What unblocks next session

Two-step approach in the follow-up plan:

1. **Step 1 (2-4h)**: pdfjs-dist positional extraction for 2021 PDF —
   resolves column ambiguity by clustering text items by x-coordinate.
2. **Step 2 (4-6h)**: tesseract.js OCR for 2019 + 2020 PDFs — six OCR
   passes total (3 appendix pages × 2 PDFs). Apply Step 1's positional
   logic to OCR output.

Total revised estimate: 8-12h (1.5 days), up from prior plan's 1 day.

## Operating notes for next session

- Worktree exists at `C:\Users\email\projects\_worktrees\mn-historical`.
  Either reuse or `git worktree remove` and re-create.
- `pdf-parse@2.4.5` is in `package.json` but NOT installed on fresh
  checkout. Install with `npm install --no-save pdf-parse@2.4.5`.
- `scrape-mnbar-discipline.mjs` runs `main()` unconditionally on import
  — refactor with a `pathToFileURL(process.argv[1])` guard before
  trying to test `extractEntriesFromText` standalone.
