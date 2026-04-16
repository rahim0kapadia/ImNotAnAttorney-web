# CourtListener API Capabilities Audit, Negative Treatment & Case Verification

**Date:** 2026-04-06
**Author:** Atti (general-purpose research)
**Purpose:** Map what CourtListener can verify about case law (especially overruled / negative treatment / good-law status), what INAA-web currently uses, and what we are leaving on the table.

---

## TL;DR, The Core Finding

**CourtListener does NOT have a "negative treatment" or "is_good_law" field in its v4 API today.** It has the raw materials to *infer* it (the citation graph + parentheticals), but no out-of-the-box "this case was overruled" flag.

The Free Law Project (FLP) is **actively building** an AI-driven citator (proof-of-concept finished May 2025), but as of April 2026 it is still not exposed via API or bulk data.

INAA-web currently uses **3 of ~12 useful CourtListener endpoints**. The biggest gaps:

1. We never query `/api/rest/v4/opinions-cited/` to detect forward citations / negative treatment
2. We never use the `/api/rest/v4/citation-lookup/` endpoint (the parent project does, see `API-TOKEN-SIGNUP-GUIDE.md`)
3. We never extract negative-treatment signals (`overruled by`, `abrogated by`, `superseded by`) from the full opinion text we *already fetch* in `classify-case-law.mjs`

This is the existing `is_good_law returns null` problem documented in `C:\Users\email\projects\ImNotAnAttorney\docs\API-TOKEN-SIGNUP-GUIDE.md` line 43.

---

## 1. CourtListener API Endpoints Available for Negative Treatment / Case Verification

### 1a. The Citation Graph, `/api/rest/v4/opinions-cited/`

**This is the endpoint we're not using and should be.**

- **Path:** `https://www.courtlistener.com/api/rest/v4/opinions-cited/`
- **Auth:** `Authorization: Token <key>` header (same token we already have)
- **Filters:**
  - `id`, NumberRangeFilter (exact, gte, gt, lte, lt, range)
  - `citing_opinion`, RelatedFilter (the opinion doing the citing)
  - `cited_opinion`, RelatedFilter (the opinion being cited)
- **Response fields:**
  - `id`
  - `resource_uri`
  - `citing_opinion` (URL)
  - `cited_opinion` (URL)
  - `depth`, **how many times the citing opinion references the cited opinion** (signal for centrality / importance)
- **Two query directions:**
  - **Forward citations** (later cases that cite OUR case): `?cited_opinion=<our_id>`, this is how you build a "Cited By" / "Shepardize" view
  - **Backward citations** (cases OUR case relies on): `?citing_opinion=<our_id>`, this is how you build a "Table of Authorities"

**Why this matters for INAA:** A case with hundreds of forward citations (`depth` summed across results) is load-bearing precedent. A case with zero forward citations is either brand-new, niche, or quietly dead. This is the closest CourtListener gets to a Shepard's signal, and it's a free public endpoint we have a token for.

### 1b. Citation Lookup (Hallucination Verification), `/api/rest/v4/citation-lookup/`

- **Method:** `POST`
- **Body forms:**
  - `text=<block of text>`, pass arbitrary text, get back resolved citations
  - `volume=<n>&reporter=<reporter>&page=<n>`, explicit lookup
- **Rate limit:** 60 valid citations / minute (per existing memory `reference-courtlistener-api.md`)
- **Use case:** Anti-hallucination layer, confirms a citation exists before we put it in front of a defendant. This is what the parent project (`ImNotAnAttorney-engine`) already uses (`API-TOKEN-SIGNUP-GUIDE.md` line 19: "Switched from general search API to Citation Lookup API. General search returned wrong cases; Citation Lookup returns exact matches.").
- **INAA-web is NOT currently using this.** All three of our scripts use the search endpoint instead, which is documented as returning wrong matches for citation lookups.

### 1c. Case Law APIs, `/api/rest/v4/clusters/` and `/api/rest/v4/opinions/`

We use these. Both have fields we're not reading:

**Cluster fields we fetch:** `sub_opinions`
**Cluster fields we ignore:**
- `disposition`, explicit appellate result (added in v3.8 with Harvard data)
- `history`, case history annotations
- `correction`, corrections issued post-publication
- `cross_reference`, related case pointers
- `headnotes`, Harvard headnote text (great for holding extraction)
- `other_dates`, supplementary date metadata
- `precedential_status`, published / unpublished / errata / in-chambers
- `citations`, array of parallel citations for the cluster
- `judges`, `panel`, `non_participating_judges`, judge info for binding-authority checks

**Opinion fields we fetch:** `html_with_citations`, `plain_text`
**Opinion fields we ignore:**
- `type`, `010combined` (combined), `020lead`, `030concurrence`, `040dissent`, **critical: we currently treat dissents as authority, which is wrong**
- `opinions_cited`, list of citations in this opinion (alternative to opinions-cited endpoint)
- `ordering_key`, opinion order within cluster (Harvard/Columbia sources)
- `html_columbia`, `html_lawbox`, `xml_harvard`, `html_anon_2020`, fallback content sources

### 1d. Other Available Endpoints (we don't touch any of these)

Per the v4 docs at `/help/api/rest/`:

- `/api/rest/v4/dockets/`, case-level docket information
- `/api/rest/v4/courts/`, court metadata (use this to verify binding jurisdiction instead of string-matching court names)
- `/api/rest/v4/people/`, judge records (X-Ray and War Room tier, judge intel)
- `/api/rest/v4/financial-disclosures/`, judge financial disclosures (bias signals for judge intel)
- `/api/rest/v4/oral-arguments/`, oral argument audio + transcripts (largest collection in the world)
- `/api/rest/v4/recap/`, RECAP / PACER federal court records (for federal defendants, INAA's federal tier)
- Alerts / Webhook APIs, could power War Room "weekly intel" tier (push-based monitoring instead of cron polling)

---

## 2. What INAA-web Currently Uses vs What's Available

### Current usage (3 scripts, 3 patterns)

| Script | Endpoint | Purpose |
|------, |----------|---------|
| `scripts/legal-research-fl.mjs` line 285 | `GET /api/rest/v4/search/?type=o&q=&court=&order_by=citeCount+desc` | Find FL cases citing a statute |
| `scripts/legal-research-all.mjs` line 487 | `GET /api/rest/v4/search/?type=o&q=&court=&order_by=citeCount+desc` | Find cases per jurisdiction citing a statute |
| `scripts/classify-case-law.mjs` lines 305-311 | `GET /api/rest/v4/clusters/<id>/?fields=sub_opinions` then `GET <opinion_url>?fields=html_with_citations,plain_text` | Fetch full opinion text to classify defense vs prosecution |

**What we extract from those calls:**
- Case name, citation array, court, dateFiled, syllabus, posture, cluster_id, absolute_url (search results)
- `sub_opinions` URL list (cluster)
- `html_with_citations` and `plain_text` (opinion)

**Classification logic** (`classify-case-law.mjs` lines 138-170):
- Defense signals: `reversed`, `vacated`, `quashed`, `remanded`, `error to admit`, `should have been suppressed`, `trial court erred`, `unconstitutional as applied`
- Prosecution signals: `affirmed`, `harmless error`, `properly admitted`, `no abuse of discretion`, `petition denied`, `without merit`, `conviction upheld`
- Binding-court check: string-matches `supreme court of florida` or `district court of appeal of florida` against `court` field

### Gaps, what's available but unused

| Capability | Endpoint / Method | Currently |
|---------, |------------------|---------, |
| Forward citation count (Shepard's-lite) | `/opinions-cited/?cited_opinion=<id>` | Not used. Free, instant, the closest thing CL has to negative-treatment intel. |
| Backward citation graph (Authorities) | `/opinions-cited/?citing_opinion=<id>` | Not used. Could auto-generate Tables of Authorities for War Room tier. |
| Citation hallucination check | `POST /citation-lookup/` | Not used. Engine repo uses this; we use the worse search endpoint. |
| Negative treatment string scan | Already-fetched `plain_text` | **We have the text but don't grep for `overruled by`, `abrogated by`, `superseded by`, `disapproved`, `receded from`, `no longer good law`.** |
| Opinion type filtering | Cluster `sub_opinions[].type` | We blindly take `sub_opinions[0]`, could be a dissent. |
| Precedential status | Cluster `precedential_status` | Unpublished opinions get treated the same as published in classification. |
| Headnote-based holding extraction | Cluster `headnotes` (Harvard data) | We string-search for "we hold" / "we conclude" instead. Headnotes are court-authored and far more reliable. |
| Court object lookup | `/courts/<id>/` | We string-match court names. Court objects have `jurisdiction`, `position_count`, `court_url`, properly typed. |
| Judge records | `/people/<id>/`, `/financial-disclosures/` | Not used. This is what unlocks the X-Ray ($2,497) and Intelligence Brief ($997) judge intelligence tiers. |
| RECAP / PACER docket data | `/recap/`, `/dockets/` | Not used. Federal tier could surface real docket activity. |
| Alerts / Webhooks | `/alerts/`, `/webhooks/` | Not used. War Room weekly updates are currently scheduled cron polls. |

---

## 3. How to Check if a Case Has Been Overruled / Superseded via CourtListener

**There is no single "is_good_law" call.** You have to compose it from three signals:

### Signal A, Search the opinion text we already fetch (cheapest, do this first)

In `classify-case-law.mjs` we already fetch `plain_text` for every cluster. Add a string-includes pass for negative-treatment phrases:

```
overruled by
overruled in
abrogated by
superseded by
disapproved by
receded from
no longer good law
no longer the law
limited by
called into doubt
```

These are the standard Bluebook negative-treatment verbs. If our case name appears in another opinion preceded by one of these phrases, it's negative treatment. We can implement this without any new API calls, purely from text we already pull.

### Signal B, Use `/opinions-cited/?cited_opinion=<id>` to enumerate forward citations

For each case in `statute_case_law` with a `courtlistener_cluster_id`:

1. Get the opinion ID(s) from `cluster.sub_opinions`
2. `GET /api/rest/v4/opinions-cited/?cited_opinion=<opinion_id>`, paginate
3. For each citing opinion, fetch `plain_text` and string-search for negative-treatment phrases **in proximity to our case name** (e.g. within 200 chars)
4. If found, mark `is_good_law = FALSE` with the citing case as evidence
5. Sort by `depth` desc, opinions that cite us heavily and negatively are the strongest signal

This is the ManualShepardize approach. Slower (one extra API call per case + one per forward citer), but it produces an evidence-trail.

### Signal C, Compose with `disposition` / `precedential_status` from cluster

The Cluster object has a `disposition` field (added in v3.8 from Harvard CAP). For appellate decisions it often contains the explicit appellate result ("affirmed", "reversed and remanded"). We're not reading it.

`precedential_status` is also worth checking, values include `Published`, `Unpublished`, `Errata`, `Separate`, `In-chambers`, `Relating-to`, `Unknown`. Unpublished opinions are non-binding even within the issuing court, we should not treat them as binding authority.

### Signal D (future), FLP's AI Citator when it ships

Per [free.law/2025/05/01/citator/](https://free.law/2025/05/01/citator/):

- **Status:** Proof of concept complete (May 2025), not yet API-accessible
- **Method:** Uses EyeCite to find citation locations, extracts 6 sentences before/after each citation, classifies via LLM
- **Accuracy in tests:** Claude 3.5 Sonnet hit 90%+ recall and 80%+ F1 on Supreme Court overruling detection; Mistral Large hit 80%+ precision
- **Will be:** Free, open-source, integrated directly into CourtListener case-law search
- **Timeline:** Not announced. "Watch this space."
- **Caveat:** Initial scope is SCOTUS overruling only. State-court appellate-chain detection is "future work."

**Implication for INAA:** We should subscribe to Free Law Project's blog and check `/help/api/rest/changes/` quarterly. When this ships, our entire negative-treatment problem gets solved upstream. Until then, we composite Signals A + B + C ourselves.

### Signal E (paid alternative), Descrybe.ai Cytator

See section 4.

---

## 4. What Descrybe.ai Adds (mentioned in API-TOKEN-SIGNUP-GUIDE.md)

`API-TOKEN-SIGNUP-GUIDE.md` line 49 lists Descrybe.ai as `$10/month, credit card (negative treatment / good-law detection)`, flagged "optional, system works without these."

### What Descrybe.ai actually offers (Cytator + Brief Checker, June 2025 launch)

**The Cytator**, AI-driven citator with color flags:

- **Green**, positive treatment
- **Red**, negative treatment
- **Yellow**, cautionary
- **Black**, neutral
- Plus other treatment buckets

**Differentiator vs Shepard's / KeyCite:** Bidirectional. Standard citators only show forward treatment ("how later cases treated this one"). Cytator also shows **backward treatment**, "how this case analyzed the cases it cited." That's useful when defending against a State citation: you can see whether the State's cited case relied on cases that have themselves been weakened.

**Brief Checker**, paste a brief, get color-coded citation status. Catches hallucinated, inaccurate, or incomplete citations.

**Pricing (as of June 2025 launch):**
- **Non-commercial:** $10/month
- **Commercial (lawyers):** $20/month
- **Free tier:** All previously-available features still free

**Limitations (per LawSites review):**
- Only checks case citations (not statutes, regulations, or Westlaw-only cites)
- Cannot verify quotation accuracy (only citation existence + treatment)
- Author found instances of incorrect flagging due to "ambiguity in the text"
- API access not documented publicly, would have to email Descrybe.ai to confirm whether programmatic access exists

**Important context, citator accuracy in general:** A 2018 study found Shepard's and KeyCite each missed or mislabeled **about 1/3 of negative citing relationships**. Bloomberg's BCite missed over 2/3. Even the gold standards are wrong a lot. Descrybe is a college try, not a silver bullet.

### Should INAA pay for Descrybe.ai?

**Recommendation:** Not yet, for three reasons:

1. **No documented API.** A web-only tool doesn't help our pipeline. We'd have to scrape it (against ToS) or manually verify cases (doesn't scale to 757 rows).
2. **Composite of Signals A+B+C from CourtListener gets us most of the way.** String-scanning the `plain_text` we already fetch is free.
3. **FLP's open-source citator is in the pipeline**, paying Descrybe is a 6-12 month bridge at best.

**Revisit when:** (a) Descrybe publishes an API, OR (b) FLP's citator ships and we want a second source for cross-validation, OR (c) the Intelligence Brief ($997+) tier needs warranty-grade citation verification and the math of $20/mo vs liability flips.

---

## 5. Rate Limits and Authentication

### Authentication

All three methods are supported. We use #1.

1. **HTTP Token Authentication** (current INAA-web pattern)
   - Header: `Authorization: Token <token>`
   - Token stored in `C:\Users\email\projects\ImNotAnAttorney-web\.env.local` as `COURTLISTENER_TOKEN`
   - Account: `imnotanattorney` / `rahim0kapadia@gmail.com` (registered 2026-03-13 per `API-TOKEN-SIGNUP-GUIDE.md`)
   - Profile / token regen: https://www.courtlistener.com/profile/api/

2. Cookie/session auth (browser-only, not useful for us)

3. HTTP Basic Auth (works with curl, no real advantage)

### Rate Limits (per `/help/api/rest/` and existing memory)

| Limit | Value | Notes |
|-------|-------|-------|
| **Authenticated query rate** | **5,000 requests / hour** | Hard ceiling. Our scripts sleep 750ms between calls = ~4,800/hour, just under. |
| **Citation lookup rate** | **60 valid citations / minute** | Specific to `/citation-lookup/` |
| **Pagination depth** | **100 pages standard** | Beyond that requires `id`, `date_modified`, or `date_created` ordering |
| **Account multiplicity** | **One account per project/person/org** | Creating multiple accounts to bypass limits is prohibited |

### Our current rate-limit posture

- `legal-research-fl.mjs` line 394: 1000ms between CourtListener calls → 3,600/hour ceiling
- `legal-research-all.mjs` line 633: 750ms between CourtListener calls → 4,800/hour ceiling
- `classify-case-law.mjs` line 33: 750ms between calls → 4,800/hour ceiling

**We are within limits but close.** If we add forward-citation enumeration (Signal B above), each case becomes N+1 calls. For 757 rows with avg 20 forward citations = ~16K calls = 3.2 hours. Doable but tight. Better: paginate forward citations once, store cluster IDs, then batch-fetch only the top-K-by-depth.

---

## 6. Recommended Action Plan (for a future plan, not for this audit)

Sorted by impact-per-hour:

### Quick wins (≤1 day each, no new API calls)

1. **Add negative-treatment string scan to `classify-case-law.mjs`**, we already fetch `plain_text`. Add a `NEGATIVE_TREATMENT_PHRASES` array and mark `is_good_law` accordingly. Costs us nothing.
2. **Fetch and respect `precedential_status`**, stop classifying unpublished opinions as binding authority.
3. **Filter `sub_opinions` by `type`**, currently we grab `[0]` which can be a dissent. Prefer `010combined` or `020lead`.
4. **Read `disposition` from cluster**, explicit appellate result, more reliable than string-matching `plain_text`.

### Medium (≤1 week)

5. **Switch to `/citation-lookup/` POST endpoint for citation verification**, the engine repo already proved this is more accurate than search. Eliminates the wrong-case problem in our `searchCaseLaw` functions.
6. **Forward citation enumeration via `/opinions-cited/?cited_opinion=`**, populate a new column `forward_citation_count` and `negative_treatment_evidence` (JSONB array of citing cases that contain negative phrases).

### Strategic (X-Ray / War Room tier features)

7. **Wire up `/people/` and `/financial-disclosures/`** for judge intelligence (currently a $997 IB feature with no real data backing it).
8. **Use `/recap/`** for federal-tier defendants (federal charges go through PACER).
9. **Replace cron polling with `/alerts/` webhooks** for War Room tier weekly intel.

### Watch list (no action, just monitor)

10. Subscribe to https://free.law/blog/ and `https://www.courtlistener.com/help/api/rest/changes/`, when FLP's AI citator ships, drop our composite logic and use it instead.

---

## File References

**Current INAA-web CourtListener integrations:**
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\classify-case-law.mjs` lines 95-114 (clFetch helper), 305-311 (cluster + opinion fetch), 138-170 (signal arrays), 168-260 (classifyOpinion)
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\legal-research-all.mjs` lines 451-510 (CL_COURT_MAP, searchCaseLaw), 487 (search URL)
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\legal-research-fl.mjs` lines 273-321 (searchCaseLaw), 285 (search URL)

**Parent project guidance:**
- `C:\Users\email\projects\ImNotAnAttorney\docs\API-TOKEN-SIGNUP-GUIDE.md` line 19 (Citation Lookup API switch), line 43 (`is_good_law returns null` problem), line 49 (Descrybe.ai pricing)
- `C:\Users\email\projects\ImNotAnAttorney\system\Attorney-Personas\CASE-LAW-VALIDATION-PERSONA.md` lines 76 (Good Law check sources), 116-131 (web verification flow), 117-123 (negative treatment phrases, `overruled by`, `abrogated by`, `superseded by`)

**External documentation:**
- CourtListener REST API root: https://www.courtlistener.com/help/api/rest/
- Case Law APIs: https://www.courtlistener.com/help/api/rest/case-law/
- Citation APIs (`/opinions-cited/`): https://www.courtlistener.com/help/api/rest/citations/
- Bulk Data (parentheticals): https://www.courtlistener.com/help/api/bulk-data/
- FLP AI Citator progress (May 2025): https://free.law/2025/05/01/citator/
- Descrybe.ai launch coverage: https://www.lawnext.com/2025/06/free-legal-research-site-descrybe-ai-launches-a-paid-suite-of-legal-research-tools-including-its-own-citator.html
- Descrybe.ai features: https://descrybe.ai/features
