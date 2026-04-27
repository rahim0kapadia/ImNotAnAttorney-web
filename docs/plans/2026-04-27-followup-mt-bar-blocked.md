# Follow-up: Montana Bar Discipline — Blocked, Documented Path

**Date:** 2026-04-27
**Parent task:** G1c bar-discipline ME/MT/RI/DE batch
**Status:** BLOCKED — no tractable bulk surface for >=10 events under $0 budget

## Why MT is blocked

Three sources probed; none yield the >=10 attorney-discipline-event acceptance threshold under our standard scrape pattern:

1. **Montana Office of Disciplinary Counsel (montanaodc.org/attorney-discipline)**
   - Page is fully JS-rendered (Wix/GoDaddy Website Builder).
   - `curl -s -L -A "<UA>"` returns ~131 KB of HTML containing zero attorney names, zero PDF links, zero discipline records — only Playfair font CSS, navigation chrome, and 2 outbound links (montanaodc.org, supremecourtdocket.mt.gov).
   - Probed 2026-04-27.

2. **Montana Supreme Court (CourtListener `court=mont`)**
   - `docketNumber:"PR"` (the canonical MT lawyer-discipline docket prefix) returns **9 total opinions** across all years.
   - Of those 9, ~4 are judicial-discipline cases (`Inquiry Concerning Complaint Of: Judicial Standards Commission v. <Judge>`), not attorney-discipline.
   - Net attorney-discipline yield: ~5-6 unique opinions. Below acceptance threshold.
   - Probed 2026-04-27 with token authentication.

3. **Montana Supreme Court Docket Search (supremecourtdocket.mt.gov)**
   - Tract Manager / PerceptiveJUDDocket portal — vendor product requiring session-based search submission.
   - Not URL-tractable; appears to require captcha or cookies on POST submit. No public CSV/JSON endpoint advertised.

### Why this is structural, not a missing scraper

Montana's lawyer-discipline volume is genuinely small. The 2024 ODC Annual Report cites 21 forms of discipline imposed across 10 matters that year — confirming low absolute volume. The Supreme Court publishes only the public-discipline orders that result from contested hearings; private admonitions never become public records.

CourtListener's `court=mont` ingest is also thin compared to states like FL/CA/NY because Montana hands few opinions per year and CL hasn't backfilled MT pre-2007 in detail.

## What would unblock MT

Three plausible paths, none $0:

1. **Manual PDF scraping of the ODC's Order of Public Discipline list.**
   - The ODC page references a downloadable PDF called "Order of Public Discipline" but it is loaded dynamically and was not at the URLs probed.
   - Would require a headless browser session (Playwright) to render the Wix-built page and extract the live PDF URL. ~2-4h work, $0 if the PDF actually exists.

2. **Per-PDF scrape of `juddocumentservice.mt.gov` Supreme Court documents** indexed by PR docket numbers.
   - Each PR docket may have 1-3 PDFs (complaint, order, opinion). Walking PR-NN-NNNN range from 2007-2026 is ~300-500 dockets, of which maybe 30-50 are lawyer-discipline. ~6-8h work to build, plus rate-limit politeness window.

3. **State Bar of Montana (montanabar.org)** — has a "Problems With a Lawyer" page that includes a public-discipline summary. Same Wix-class site shape, JS-rendered. Same Playwright work.

## Recommended path when unblocked

Path 1 (Playwright session against `montanaodc.org/attorney-discipline`) is the cheapest. The ODC's static "Order of Public Discipline" PDF is the agency's own canonical bulk surface; everything else is derivative. ~2-4h of work to (a) render the page, (b) extract the live PDF URL from rendered DOM, (c) fetch + parse PDF (`pdf-parse` v2 class API, same shape as TX scraper), (d) write `scrape-mtbar-discipline.mjs`.

If Path 1 fails (PDF embedded as image / no extractable text), fall back to Path 2 (per-PR-docket PDF scrape of `juddocumentservice.mt.gov`).

## Acceptance gate when unblocked

Same as other batches:
- >=10 events with HTTPS source_url
- per-attorney granularity (no anonymous "Member of the Bar" rows)
- anti-hallucination audit clean (`jurisdiction='MT'`, `bad=0`)
- discipline_type values from the canonical enum
- bar_number stable: `MTSC:<docket>` for CL-anchored, or `mt-name-<md5>` for HTML/PDF-anchored

## Out of scope for this follow-up

- Adding MT to the IB attorney bar-discipline section (PR #152 wire-up). Wait until MT has live data.
- Cross-jurisdiction CL queries that scoop MT alongside other states. Each state still needs a per-court anchor.
