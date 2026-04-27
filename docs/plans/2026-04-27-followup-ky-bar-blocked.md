# Follow-up: Kentucky Bar Discipline Scrape (Blocked / Deferred)

**Date:** 2026-04-27
**Parent task:** G1a — bar discipline KY/OR/OK/CT batch (`docs/plans/2026-04-27-data-completeness-master.md`)
**Status:** BLOCKED — primary CL surface returns only 8 results; alternate sources need separate scraper.

## Failure mode

The KY/OR/OK/CT batch shipped OR + OK + CT via CourtListener (court=okla 1238 SCBD opinions, court=or 215+ disciplinary opinions, court=conn,connappct 28+ OCDC opinions). KY broke the pattern:

- `https://www.courtlistener.com/api/rest/v4/search/?type=o&court=ky&q=%22attorney+discipline%22` returned only **8** results across all years — well below the 10-event acceptance threshold per state and orders of magnitude below other states.
- KY Supreme Court attorney-discipline opinions are not as comprehensively indexed by CourtListener as OK/OR/CT.
- `https://www.kybar.org/page/inquirycommissionorders` (the URL named in the task brief) returns **404**.
- `https://kybar.org/For-Public/KBA-Currently-Suspended-and-Disbarred-Lawyers` is a search-form landing page; the underlying search results render via JavaScript not parseable by static `fetch` — would require Playwright.
- `https://kybar.org/search/all.asp?bst=&searchterm=&search_field=members&active_status=Disbarred` (deduced search path) returns **404**.

## Confirmed alternate source: Kentucky Court Report

`https://kycourtreport.com/category/attorney-discipline-after-102009/` is a third-party WordPress blog that publishes monthly digest posts of KY Supreme Court attorney-discipline orders, going back to 2009.

- Pagination: `?page/N/` — at least 5 pages (estimated ~50-100 monthly digest posts since 2009).
- Each post URL like `/september-26-2019-attorney-discipline-orders-rachelle-nichole-howell-michele-bradley-rodger-moore-timothy-belcher-michael-shields/`.
- Each post body lists multiple attorneys with their discipline (suspension, disbarment, etc.) plus a link to the underlying KY Supreme Court order.
- Per-attorney granularity is achievable by parsing each post body.

This is third-party but is the most comprehensive structured KY discipline archive on the public web.

## Proposed unblock plan

1. Build `scripts/ingest/scrape-kybar-discipline.mjs` that:
   - Walks pages 1..N of `kycourtreport.com/category/attorney-discipline-after-102009/`.
   - Fetches each post URL, extracts: (a) individual attorney names from the post body, (b) discipline type per attorney, (c) source order URL on `kycd.uscourts.gov` or `apps.legislature.ky.gov` or wherever each post links to, (d) order date from post title + body.
   - Uses the underlying KY Supreme Court order URL as `source_url` (per no-hallucinated-legal-data rule — third-party blog is not the primary source). If post lacks an order URL, falls back to the post permalink BUT marks `verification_notes='source: kycourtreport.com digest, KY SC order link not present in post'`.
   - bar_number = "KYSC:<order-doc-id>" if extractable, else `'KY-' + md5(name + date).slice(0,12)` (synthetic, FL-style).
2. Anti-TN-bug check: validate parser against ≥3 actual KY Court Report posts BEFORE building fixtures.
3. Anti-hallucination audit per pattern.
4. Respect `kycourtreport.com` robots.txt; 1.5-2 s polite delay; UA identifies INAA.
5. Estimated yield: ~50-100 events (2009-2026, ~10 monthly digests/year × 12 events/year = ~100/year × 17 years = ~1700 max, but most monthly digests cover 1-3 attorneys, so realistic ~300-500).

## Estimate

- 4-6 hours: scraper + per-post extractor + tests + dry-run + apply + audit + PR.
- Compared to the 1-2 hours each for OK/OR/CT (which had clean structured CL data), KY's per-post HTML extraction adds complexity worth a separate session.

## Acceptance criteria

- ≥10 events in `attorney_discipline_events` with `jurisdiction='KY'`.
- Every row has HTTPS `source_url` (preferring underlying KY Supreme Court order URL over the kycourtreport.com permalink — but the permalink is acceptable per no-hallucinated rule as long as it points to a real, fetchable, third-party source).
- Per-attorney granularity (one row per attorney even when a single post lists multiple).
- Anti-hallucination audit clean.

## Why not deferred silently

Per Pristine-or-Nothing: this follow-up has a written plan with concrete URLs, approach, and acceptance criteria. The remaining 3 of 4 states (OK, OR, CT) ship in this session. KY ships in a follow-up session that can pick up from this plan with zero re-triage cost.
