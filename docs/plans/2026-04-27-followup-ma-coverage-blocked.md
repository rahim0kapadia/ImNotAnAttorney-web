# Follow-up: MA Coverage — Path Beyond 464 Events Is Blocked at $0 Budget

**Status:** This session shipped 439 MAD federal events (PR feat/ma-bar-discipline-full). Total MA = 464 (439 federal + 25 SJC state). Original goal: ≥1,000.

## What was tried (and yielded)

| Source | Yield | Status |
|---|---|---|
| `https://www.mad.uscourts.gov/attorneys/data/discipline.json` (federal MAD) | **499 raw → 439 retained after Reinstatement filter** | SHIPPED this session (`scripts/ingest/scrape-mabar-federal-discipline.mjs`) |
| CourtListener `court=mass` + `q="In the Matter of"` (state SJC) | 73 search results → 25 events extracted (existing scraper) | already shipped PR #161; re-ran 2026-04-26 yielded 0 new events |
| `classified_opinions.case_name` filter for MA discipline keywords | **0 matches** | case_name field is largely placeholder `cluster:N` strings; not viable |
| `classified_opinions` with broader keywords (`%matter%`, `%discipline%`, `%suspension%`, `%disbar%`, `%reprimand%`) | **0 matches** in 5,579 MA opinions | data shape blocks this approach |
| BBO annual PDFs (`bbopublic.massbbo.org/web/f/fyNNNN.pdf`) | already covered by PR #161 (admin/process narrative, 25 events) | not a structured per-attorney list — sparse mentions only |
| `decisions.massbbo.org` (Lexum-powered SPA) | **403 + CAPTCHA** on every direct GET, every UA tested, both PowerShell and WebFetch | per spec: do not attempt CAPTCHA bypass |
| `mass.gov/info-details/bar-docket-and-attorney-discipline` | **403 to scrapers** | bot-blocked at edge |
| CourtListener `court=mad` + discipline keyword search | 16 opinion results (mostly tangential) | not a clean discipline source — opinion search does not isolate discipline orders |
| CourtListener `type=r` (RECAP dockets) `court=mad` + discipline keywords | 229 results — but mostly civil cases mentioning "disciplinary proceedings" tangentially | parser confidence too low; would risk hallucination |

## What's still available, but costs > $0 or violates safety rules

| Path | Why blocked |
|---|---|
| **Lexum search API for `decisions.massbbo.org`** | Lexum exposes search/result APIs but `decisions.massbbo.org` returns 403 to all unauthenticated requests; would need IP whitelisting or enterprise license. CAPTCHA bypass explicitly forbidden in plan. |
| **OCR pipeline on BBO admin PDFs (FY2010-FY2024 = ~14 reports)** | Even fully OCR'd, narrative format means each report yields ~10-30 names total (mirroring the 25 already extracted). Best case: ~280 events for ~14 reports. Still leaves us below 1,000. PDF entries also lack structured docket numbers, requiring synthesized hash keys for every row. |
| **Boston Bar Journal monthly discipline columns** | Behind paywall; no public bulk feed. Would require subscription + content licensing. |
| **PACER scrape of mc-docket attorney discipline orders** | PACER charges per-page; ~$0.10/page × hundreds of pages = $50-100+ for a single bulk. Also rate-limited and TOS-restricted for bulk scraping. |
| **Massachusetts Lawyers Weekly discipline column** | Subscription paywall. |
| **Mass.gov bar-docket page direct scrape with rotating UAs / proxies** | Already 403'd to scrapers; would require residential-proxy rotation = paid service. Also borderline TOS-violation. |

## Recommendation

**Accept 464 as the achievable ceiling at $0 budget for now.** This is a 18.5× improvement over the prior 25-event coverage. It captures:
- 100% of federal-court attorney discipline in the District of Massachusetts since 2010
- All SJC orders that CourtListener has indexed (25 since 2014)
- 0 hallucinations: every row has HTTPS source_url returning 200 at scrape time

If MA coverage becomes blocking for a customer-facing tier (e.g. IB renders thin MA disclaimer), re-evaluate paid options:
1. Lexum enterprise license for decisions.massbbo.org (likely the canonical source — would unlock ~5,000 historical events)
2. PACER bulk fetch budget ($50-100 one-time)
3. Subscription to Mass Lawyers Weekly + content extraction agreement

## Acceptance criteria (revised)

- ✅ MA events ≥ 100 (achieved: 464)
- ✅ Per-attorney granularity: 425 unique attorneys
- ✅ 100% HTTPS source_url, 0 NULL
- ❌ Original goal of ≥1,000 — blocked at $0 budget; path forward requires paid sources or CAPTCHA-bypass (forbidden)

## Constraint reminder

Per `~/.claude/rules/no-hallucinated-legal-data.md`: every row written this session has an HTTPS source_url anchored to either `mad.uscourts.gov/attorneys/discipline.htm` (the live JSON listing endpoint) or `courtlistener.com/opinion/<id>/` (existing SJC pattern). No fabricated BBO numbers, no inferred sanctions.
