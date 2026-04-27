# Follow-up: MN Bar Discipline Historical Years — BLOCKED PENDING OCR + COLUMN-DISAMBIGUATION

## Status (2026-04-26)

Investigation completed against the prior plan
(`docs/plans/2026-04-26-followup-mn-discipline-historical-years.md`).
Conclusion: not shippable in a single 1-day session under the
no-hallucinated-legal-data hard rule. Two distinct blockers, each with a
defined unblock path. Estimate revised to **2-3 days** with OCR work as
the dominant cost.

## What was investigated

### Calendar-year vs PDF-year clarification
The prior plan's "2019/2020/2021" referred to **PDF publication years**.
Existing prod data (102 events from PR #158) covers calendar years
2021/2022/2023 (sourced from the 2022/2023/2024 PDFs respectively).

The TRUE coverage gap is **CY2018, CY2019, CY2020**, sourced from the
2019, 2020, and 2021 OLPR annual reports.

### Source #1 — LRO lawyer search (per the prior plan)

`https://lro.mn.gov/for-the-public/lawyer-discipline-search/` redirects
to `https://olpr.mncourts.gov/lawyer-search/`, which embeds an iframe at
`https://lawyersearch.mncourts.gov`. The iframe form supports
per-attorney lookup ONLY (Last Name, First Name, City, State, Lawyer ID,
Rule Violation, Authorized status). No browse-all, no year filter, no
date range, no public bulk export. **Not usable for bulk historical
extraction.**

### Source #1.5 — `olpr.mncourts.gov` annual reports (NEW finding)

The prior plan probed `lprb.mncourts.gov/...` URLs which all returned
404. Investigation found that the live annual-reports page is at
`https://olpr.mncourts.gov/about/annual-reports/`, with all three
historical PDFs hosted at:

- `https://olpr.mncourts.gov/wp-content/uploads/2024/04/2019-Annual-Report_compressed.pdf` (CY2018, 7.1 MB)
- `https://olpr.mncourts.gov/wp-content/uploads/2024/04/2020-Annual-Report_compressed.pdf` (CY2019, 6.8 MB)
- `https://olpr.mncourts.gov/wp-content/uploads/2024/04/2021-Annual-Report_compressed.pdf` (CY2020, 3.1 MB)

All three return HTTP 200. Two distinct text-extractability classes:

#### Class A: 2019 + 2020 PDFs — IMAGE-ONLY (OCR required)
- 2019: `pdf-parse` extracts 783 bytes, 100% page-break markers, ZERO
  body text.
- 2020: `pdf-parse` extracts 801 bytes, same pattern.
- Confirmed via `npm install pdf-parse@2.4.5` + page-by-page diagnostic.

#### Class B: 2021 PDF — TEXT-EXTRACTABLE BUT COLUMN-AMBIGUOUS
- 58,351 bytes of real text content.
- OLPR SUMMARY section located on page 38 of 46.
- Layout: two-column attorney roster — section headers stacked
  vertically (e.g. "Supreme Court Disbarment / 3 ATTORNEYS / 5 FILES /
  Supreme Court Reprimand/Probation / 5 ATTORNEYS / 5 FILES") followed
  by an attorney table whose pdf-parse linearization interleaves
  left-column rows (3 disbarments) with right-column rows (5
  reprimand-with-probation).
- Existing parser (built for 2022-2024 single-column PDFs) returns 0
  records on this layout.
- Naive linear sequential assignment to the most-recent header would
  mis-assign discipline_type to ~half the attorneys, which is a
  hallucinated-legal-data violation under
  `~/.claude/rules/no-hallucinated-legal-data.md`. Schema enforces
  `discipline_type NOT NULL` and the unique key `(jurisdiction,
  bar_number, order_date, discipline_type)` — wrong type produces the
  wrong primary-key, not just a wrong label.

### Source #2 — Bench & Bar magazine archive
- `https://mnbars.org/` — returns 403 to scripted fetches.
- WebSearch shows it's a magazine archive (per-issue PDFs), not a
  structured discipline-record list. Per-issue-PDF mining would
  re-create the same OCR + column-ambiguity problem at lower density.
- **Skip — does not improve over Source #1.5.**

## Why "ship 2021 only with NULL discipline_type" was rejected

- Schema: `discipline_type TEXT NOT NULL` and is part of the unique key.
- A best-guess assignment is, by definition, fabrication of legal data.
- The risk is not theoretical: a fabricated "disbarment" entry against
  an attorney who was actually merely "publicly reprimanded" would be
  defamatory and in the customer-facing IB report stream.

## Two-step unblock path

### Step 1 — Resolve the two-column ambiguity (2-4 hours)

Pick ONE of:

(a) **Render PDF pages to images and OCR them with `tesseract.js`
positional output.** Tesseract returns word-level bounding boxes;
column membership can be derived from x-coordinate clustering. This
gives a deterministic left-vs-right column assignment per word.
Apply same approach to 2019/2020 (Class A — already need OCR).

(b) **Use `pdfjs-dist` page rendering + `getTextContent()` to access
per-text-item x/y coordinates** (no OCR for 2021; positional data for
2021 is preserved by pdfjs-dist where pdf-parse linearizes it). Group
text items by column via x-coordinate, then by row via y-coordinate.

(c) **Cross-reference a separate authoritative source for the 2020
discipline list** to disambiguate types: e.g. the Minnesota Supreme
Court opinions feed in CourtListener (filtered to attorney
discipline cases by docket number prefix `A##-####`). If we can
recover the discipline_type per case-number from a second source,
the 2021 PDF supplies the names and the second source supplies the
types.

**Recommendation**: (b) `pdfjs-dist` positional extraction. Already
in npm registry, no native deps, deterministic, no OCR character-error
risk for 2021. Approach is general — works for 2022-2024 too if any
have hidden two-column edge cases.

### Step 2 — OCR for 2019 + 2020 (4-6 hours)

- Install `tesseract.js` (free, no native deps; downloads language data
  on first run, ~15 MB cached).
- Render PDF pages to PNG via `pdfjs-dist` `page.render(canvas)`
  pattern. Requires `canvas` package or `node-canvas` polyfill.
- Run tesseract.js per-page, target only pages around the OLPR SUMMARY
  appendix (~3 pages × 2 PDFs = 6 OCR passes, not 89).
- Apply Step 1's positional column-disambiguation logic to OCR output.
- Handle OCR character-class errors:
  - `O` / `0` confusion in case numbers (`A19-O173` -> `A19-0173`)
  - `I` / `1`, `B` / `8`
  - Missing/spurious whitespace
- Compare extracted attorney count vs the narrative summary in each
  PDF (e.g. "In 2019, X lawyers were publicly disciplined: Y disbarred,
  Z suspended, ...") as a coverage assertion. Fail-loud if the OCR
  count diverges by more than ~10% from the published summary.

## Out-of-scope from this follow-up

- 2019 PDF that the prior plan probed at `lprb.mncourts.gov` (404 then,
  404 still) — the OLPR-domain mirrors are the new canonical source.
- Pre-2018: still out-of-scope. Older annual reports may exist on the
  same OLPR site and would fall under the same Step 1 + Step 2
  framework.

## Acceptance criteria (next session)

- 2019/2020 PDFs OCR'd, 2021 PDF positionally re-extracted.
- Three new PDF URLs registered in `scrape-mnbar-discipline.mjs`
  `PDF_URLS` map.
- New parser variant `extractEntriesFromTextV2` (or named per the
  approach taken) handles the two-column layout deterministically.
- At least 30 events expected per year (2021 narrative reports 33
  publicly disciplined for CY2020; 2020 narrative reports comparable
  for CY2019; 2019 narrative reports comparable for CY2018).
- All rows: `source_url` populated with the OLPR HTTPS URL,
  HTTPS-verifiable.
- Anti-hallucination audit (post-`--apply`): zero `null_src`, zero
  `non_https`, count >= 90 across the three years.
- Tests: validate parser against ACTUAL extracted text/OCR output, not
  synthetic fixtures (per the 2026-04-26 TN parser bug class). Fixture
  is recorded LAST after live extraction is confirmed sane.
- One PR off origin/master via worktree, squash-merge.

## Worktree state

A worktree was created during the 2026-04-26 investigation at
`C:\Users\email\projects\_worktrees\mn-historical` on branch
`feat/mn-bar-discipline-historical`. It contains only this follow-up
plan (no scraper changes). Either:

- Pick up next session in that worktree, OR
- Remove it via `git worktree remove
  C:/Users/email/projects/_worktrees/mn-historical` and create a fresh
  worktree at unblock time.

## Cost estimate (when picked up)

- Step 1 (positional extraction proof-of-concept on 2021): 2-4 h
- Step 2 (tesseract.js OCR + character-error-tolerance for 2019/2020): 4-6 h
- Tests + ingest + audit + PR: 2 h
- **Total: 8-12 hours (1.5 working days)**, vs prior plan's 1-day
  estimate. The over-run is the OCR pipeline + column-disambiguation
  combined.

## Operating notes for the next session

- pdf-parse@2.4.5 is in `package.json` but NOT installed by default
  (`node_modules/pdf-parse` missing on a fresh checkout). Install via
  `npm install --no-save pdf-parse@2.4.5` before any probe scripting.
- The existing `scrape-mnbar-discipline.mjs` ends with bare `main()` at
  the entry point — importing it for testing or probing triggers a
  full run. A `pathToFileURL(process.argv[1])` guard would make
  `extractEntriesFromText` cleanly testable. (Refactor candidate.)
