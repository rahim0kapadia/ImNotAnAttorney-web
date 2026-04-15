# Defense Intelligence Data Integration — Comprehensive Design Spec

**Date:** 2026-04-14
**Status:** Draft (reviewed 2026-04-14 — 7 issues found, all fixed)
**Scope:** Wire 7 external datasets into every INAA product surface — existing products, new standalone SKUs, free conversion tools, blog/SEO content.

---

## Datasets Available

| ID | Dataset | Records | Tables in Supabase | Status |
|----|---------|---------|-------------------|--------|
| D1 | JUSTFAIR (federal sentencing + judge demographics) | 595,851 | judge_sentencing_patterns (1,097), judge_demographics (1,126), judge_sentencing_demographics (3,155), sentencing_distributions (1,977) | INGESTED |
| D2 | National Police Index (officer employment histories) | 24 states | Not yet ingested — GitHub clone at data/external-intel/npi/ | DOWNLOADED |
| D3 | Fatal Encounters (police-involved deaths since 2000) | ~30K+ | Not yet ingested — CSV at data/external-intel/fatal-encounters/ | DOWNLOADED |
| D4 | FBI NIBRS Florida (incident-level crime data) | 49 tables | Not yet ingested — CSVs at data/external-intel/fbi-crime/FL-2024/ | DOWNLOADED |
| D5 | Mapping Police Violence | 467 (partial) | Not yet ingested — CSV at data/external-intel/mpv/ | DOWNLOADED |
| D6 | BJS Felony Sentences | 19 rows | outcome_benchmarks | INGESTED |
| D7 | USSC Individual Datafiles | 94 rows | judge_sentencing_patterns | INGESTED |
| D8 | Existing CL bulk pipeline | Multiple tables | judge_profiles, judge_quotes, officer_reliability, bench_jury_divergence, case_feature_vectors, etc. | INGESTED |

---

## Data Limitations — Know Before Building

| Dataset | Limitation | Impact |
|---------|-----------|--------|
| **JUSTFAIR** | **Federal courts only.** 1,126 federal judges, zero state court coverage. Most criminal cases are state-level. | Judge Report Card, Sentencing Calculator, and Judge Comparison must label "Federal Courts" clearly. State court data comes from CL opinions (judge_profiles: 15,386 judges) + Virginia Court Data. |
| **JUSTFAIR** | Judge names are formatted differently than CL judge_profiles. JUSTFAIR: "Amy Berman Jackson". CL: might be "Jackson, Amy B." or variations. | Query strategy: normalize both to lowercase, ILIKE fuzzy match. Accept false negatives over false positives. |
| **NPI** | Cloned repo has processed CSVs for **AZ, CA, GA only** (3 states). Full 24-state data requires running NPI's Python pipeline with Dropbox access to raw data. | Phase 3 (Officer enrichment) V1 covers AZ, CA, GA. Full coverage requires contacting Invisible Institute for bulk data or running their pipeline. |
| **Fatal Encounters** | Names officer agencies, not individual officers. Matching to a specific officer requires agency + timeframe correlation, not direct name match. | Officer Background Check cross-ref is agency-level ("X fatal encounters at [agency] since 2013"), not "Officer Smith was involved in..." unless the CSV names the officer. |
| **MPV** | Only 467 records (FiveThirtyEight subset). Full 15K+ dataset behind Cloudflare bot protection. | Low coverage until full MPV obtained via headed browser download. |
| **FBI NIBRS** | Agency-level, not officer-level. FL only. | Useful for district/county prosecution context, not officer reports. |
| **Prosecutor Report Card** | JUSTFAIR has NO named-prosecutor data — district-level only. CL judge_prosecutor_pairings names prosecutors but only where motion grants/denials are recorded. | Defer "Prosecutor Report Card" as a named-prosecutor SKU. Absorb scope into "District Court Intelligence" as district-level prosecution patterns. |

---

## Architecture Principle: Mechanical Over AI

**Rule:** If the output can be produced by querying data + rendering a template, do NOT use AI. AI costs money per generation, introduces latency, hallucinates, and can't be audited deterministically.

Current Tier 9 products already follow this: `query.ts` → `render.ts` → HTML. No Claude calls. This pattern extends to everything in this spec.

**AI is reserved for:**
- Intelligence Brief sections (existing — prompt-driven analysis of case-specific intake data)
- Blog content generation (existing pipeline)
- Anything requiring natural language reasoning about a specific defendant's unique situation

**Mechanical for:**
- All Tier 9 standalone products (query → template → HTML)
- Free tools (user input → DB query → formatted result)
- Data appendices in premium reports
- Sentencing calculators, comparison tools

---

## Part 1: Existing Products — What Gets Better

### 1A. Judge Report Card ($197) — MAJOR UPGRADE

**Current state:** Queries judge_profiles, judge_quotes, sentencing_distributions, bench_jury_divergence, judge_prosecutor_pairings, appellate_trends, judge_sentencing_patterns. Pure mechanical: query → render → HTML.

**New data to wire in:**

| New Query | Table | What It Adds |
|-----------|-------|-------------|
| Judge background | `judge_demographics` | Appointing president + party, ABA rating, law school, gender, race, birth year, active years |
| Enhanced sentencing patterns | `judge_sentencing_patterns` WHERE sources='JUSTFAIR' | 595K-case-backed median/mean/p25/p75, departure rates — much richer than 94-row USSC data |
| Racial disparity analysis | `judge_sentencing_demographics` | Per-race sentencing medians + departure rates for this specific judge. Factual, sourced, zero editorial. |
| District comparison | `sentencing_distributions` WHERE district matches | "This judge vs district average vs national average" three-column comparison |

**Name matching strategy (CRITICAL):**
JUSTFAIR tables use `judge_name_normalized` (e.g. "amy berman jackson") while CL `judge_profiles` uses `full_name` (e.g. "Amy Berman Jackson" or "Jackson, Amy B."). These won't always match directly.

Approach: After finding the judge in `judge_profiles` (existing flow), normalize the matched name to lowercase and ILIKE against `judge_demographics.judge_name_normalized`. If judge_profiles returns nothing (state court judge not in CL), try a direct ILIKE on `judge_demographics.judge_name_normalized` from the raw intake name. This creates a two-source lookup: CL-first with JUSTFAIR fallback.

```
intake.judgeName → judge_profiles (CL, 15K judges)
                 ↘ judge_demographics (JUSTFAIR, 1.1K federal judges)
                   → Use whichever matches, prefer CL for judge_id, JUSTFAIR for demographics
```

**Files to change:**
- `src/lib/tier9-reports/query.ts` — Add 2 parallel queries in `queryJudgeReportCard()`: judge_demographics + judge_sentencing_demographics, using ILIKE on judge_name_normalized with the safeName derived from the matched judge_profiles name OR the raw intake name as fallback. Also add a JUSTFAIR-only fallback path: if judge_profiles finds nothing but judge_demographics has a match, return a partial result with demographics + sentencing but no CL data (quotes, pairings).
- `src/lib/tier9-reports/render.ts` — Add 3 new HTML sections in `renderJudgeReportCard()`: Judge Background table, Enhanced Sentencing Intelligence (judge vs district vs national), Demographic Sentencing Analysis table. Handle the partial-JUSTFAIR-only case gracefully (show what we have, omit CL-dependent sections).
- `src/lib/tier9-reports/coverage.ts` — **Two-source availability check:** After the existing judge_profiles lookup, add a parallel query to `judge_demographics` by normalized intake name. Available = (CL quotes >= 5 OR CL sentencing >= 1 OR CL pairings >= 1) **OR** (JUSTFAIR demographics match found). This expands availability from ~100 (CL-only) to ~1,126+ (CL union JUSTFAIR).

**Render output (mechanical template):**
- Judge Background: key-value table (appointed by, ABA rating, law school, active years)
- Sentencing Intelligence: three-column comparison table (This Judge | District Avg | National Avg) with median, mean, p25, p75, departure rates
- Demographic Analysis: race × sentencing table (cases, median sentence, departure rate per race). Source citation: "JUSTFAIR (QSIDE Institute), USSC FY2001-2023"
- All data points link to source URL: https://osf.io/nseh5/

**UPL compliance:** Pure factual data presentation. No recommendations. No "this judge is favorable." Numbers and source citations only.

---

### 1B. Officer Background Check ($97) — TRANSFORMS FROM THIN TO COMPREHENSIVE

**Current state:** Queries officer_reliability (32 rows from CL opinions) + officer_external_intel (Brady/Giglio cache). Thin — most officers return "insufficient data."

**New data to wire in:**

| New Data | Source | Ingestion Needed | What It Adds |
|----------|--------|-----------------|-------------|
| Employment history | D2 (NPI) | YES — build `scripts/ingest-npi.mjs` → officer_external_intel | Full employment timeline: departments, start/end dates, reason for separation. "Wandering officer" detection (fired → rehired pattern) |
| Fatal encounter cross-ref | D3 (Fatal Encounters) | YES — build `scripts/ingest-fatal-encounters.mjs` → officer_external_intel or new table | "Officer involved in fatal encounter: [date], [city], [circumstances]" |
| Use-of-force context | D5 (MPV) | YES — build `scripts/ingest-mpv.mjs` → officer_external_intel | Police killing incidents with demographics |
| FL arrest patterns | D4 (FBI NIBRS FL) | FUTURE — complex schema, lower priority for officer-level | Arrest patterns by agency (not officer-level) |

**Files to change:**
- `scripts/ingest-npi.mjs` — NEW: Stream NPI processed CSVs → upsert officer_external_intel with employment_history jsonb, department_transfers, separation_reasons
- `scripts/ingest-fatal-encounters.mjs` — NEW: Parse fatal-encounters.csv → match/store by officer name + agency + state
- `src/lib/tier9-reports/query.ts` — No change needed IF data goes into officer_external_intel (already queried)
- `src/lib/tier9-reports/render.ts` — Add employment history timeline section, fatal encounter alert section in `renderOfficerBackground()`
- `src/lib/tier9-reports/coverage.ts` — Lower threshold or add NPI as alternative availability signal

**Render output:**
- Employment History Timeline: chronological table of departments, dates, positions, separation reasons
- Wandering Officer Alert: highlighted box if officer has fired→rehired pattern
- Fatal Encounter Alert: highlighted box if officer name matches fatal encounter record
- Cross-Case Reliability: existing section, enhanced with more data

**Price consideration:** With NPI + Fatal Encounters, this product delivers $500+ of investigator-grade intelligence for $97. Consider price increase to $147-$197 after data depth is proven.

---

### 1C. Similar Cases Analyzer ($297) — ALREADY IMPROVED, NO CODE CHANGES

**Current state:** Queries case_feature_vectors (39,959), sentencing_distributions, plea_discount_curves, appellate_trends, outcome_benchmarks.

**Already better from today's work:**
- sentencing_distributions: 32 → 1,977+ rows (JUSTFAIR ingestion)
- outcome_benchmarks: 19 rows (BJS applied)
- plea_discount_curves: 65 rows
- case_feature_vectors: 39,959 (26K enriched with outcome/party_side)

**Zero code changes needed** — existing queries in `query.ts` already hit these tables. Richer data = richer output automatically.

**Future enhancement:** Wire FBI NIBRS FL data for arrest-rate context by charge type per county. New section: "In [county], [charge] accounts for X% of arrests — [above/below] state average."

---

### 1D. Intelligence Brief ($997) — RICHER CONTEXT DATA

**Current state:** AI-generated via 9 prompt builders in `prompts.ts`. Variables injected from `variables.ts`. Already has Tier 9 data injection points for X-Ray+ tiers.

**New data to wire in:**

| IBVariables Field (new) | Data Source | Which Sections Use It |
|------------------------|-----------|---------------------|
| `judge_demographics_summary` | `judge_demographics` | Section 3e (Case Intelligence — Judge Intel) |
| `judge_sentencing_justfair` | `judge_sentencing_patterns` + `judge_sentencing_demographics` | Section 1 (Roadmap), Section 3e, Section 4 (Plan) |
| `district_sentencing_context` | `sentencing_distributions` (JUSTFAIR district-level) | Section 2 (What's Working), Section 3e |
| `national_outcome_benchmarks` | `outcome_benchmarks` (BJS) | Section 2 (What's Working) |

**Files to change:**
- `src/lib/intelligence-brief/variables.ts` — Add new fields to IBVariables interface
- `supabase/functions/generate-report/index.ts` — Add queries for new tables, format into variable strings
- `src/lib/intelligence-brief/prompts.ts` — Inject new variables into relevant section templates (Sections 1, 2, 3e, 4)

**AI still required here** — the IB synthesizes data with case-specific intake (defendant's charges, attorney situation, court date urgency). JUSTFAIR data becomes grounding context for the AI, not a replacement for it.

**Cascade to X-Ray, War Room, Situation Room:** IB is included in all three. Richer IB = richer premium products automatically.

---

### 1E. Case Decoder ($197) — INDIRECT ENRICHMENT

**Current state:** AI-generated charge analysis + 10-15 questions. Uses prompts.ts for generation.

**Opportunity:** Add district-level sentencing context to the CD prompt:
- "In [district], defendants with [charge] receive median [X] months (range [Y]-[Z])"
- "Plea-to-trial penalty: [P]% — defendants who go to trial receive [Q]x the plea sentence"

**Files to change:**
- `supabase/functions/generate-report/index.ts` — Query sentencing_distributions for the defendant's charge + state, format as context string
- Case Decoder prompt template — Add `<sentencing_context>` block

**Small change, high impact** — gives the defendant real numbers in their first $197 product.

---

### 1F. Plea Analyzer (free tool at `/plea-analyzer`) — JUSTFAIR ENRICHMENT

**Current state:** AI-generated via Claude Edge Function (`generate-standalone` with plea-analyzer case). Multi-step intake form at `src/app/plea-analyzer/PleaAnalyzerClient.tsx` collects charge type, state, plea terms, plea offer details. Creates a $0 order, fires Edge Function, emails result. Currently uses ZERO database context — Claude analyzes from intake text alone.

**Opportunity:** Inject JUSTFAIR plea economics as grounding context to the Claude prompt:
- District-level plea discount (plea median vs trial median from sentencing_distributions)
- Judge-specific departure rates (from judge_sentencing_patterns, if judge name collected)
- National benchmark (from outcome_benchmarks — 94% plea rate nationally)

**Files to change:**
- `src/app/api/plea-analyzer/route.ts` — Before calling Edge Function, query sentencing_distributions + outcome_benchmarks for the defendant's charge + state. Format as `<sentencing_context>` string and pass as part of the Edge Function payload.
- Edge Function prompt case for plea-analyzer — Add `<sentencing_context>` block so Claude can ground its analysis in real numbers: "In your district, defendants with [charge] who go to trial receive median [X] months vs [Y] months via plea — a [Z]% trial penalty."
- Consider adding optional judge name field to PleaAnalyzerClient.tsx — if provided, query judge_sentencing_patterns for judge-specific departure rates

---

### 1G. Score Page (free tool at `/score`) — CONTEXTUAL ENRICHMENT

**Current state:** Generates case strength score based on intake data.

**Opportunity:** After score generation, show contextual data:
- "Cases like yours in [state] result in [outcome] X% of the time"
- "Average sentence for [charge] in your district: [X] months"

**Mechanical addition** — query sentencing_distributions + outcome_benchmarks, render as context below the score.

---

### 1H. Blog (43 posts + ongoing pipeline) — DATA-DRIVEN CONTENT

**Not code changes — content strategy.** New blog post angles powered by real data:

| Topic | Dataset | Hook |
|-------|---------|------|
| "595,851 Federal Sentences Exposed: What Your Judge Is Really Doing" | D1 JUSTFAIR | Aggregate statistics, no individual judge names in blog (save that for the product) |
| "The Plea Trap: Why 94% of Defendants Never See a Jury" | D6 BJS | National plea rate data |
| "Bench Trial vs Jury Trial: Real Numbers from 8,383 Virginia Trials" | Existing bench_jury | Virginia court data |
| "Is Your Arresting Officer in This Database?" | D2 NPI, D3 Fatal Encounters | Tease officer background check product |
| "The Sentencing Gap Nobody Talks About" | D1 JUSTFAIR racial disparity | Aggregate disparity data — factual, sourced |
| "What 30,000 Police Encounters Tell Us About Your Rights" | D3 Fatal Encounters | Arrest rights content → Playbook upsell |

Each post is a top-of-funnel SEO play → email capture → drip → product purchase.

---

### 1I. Partner Portal (at `/partner`) — TRUST SIGNAL

**Not a code change to the portal itself** — but partner-facing materials can reference data depth:
- "Our reports draw from 595,851 federal sentencing records, 15,386 judge profiles, and 24 states of officer employment data"
- Increases partner confidence → more referrals

---

## Part 2: New Free Tools (Conversion Funnel Top)

### 2A. Sentencing Calculator — `/tools/sentencing-calculator`

**What it does:** User enters charge type + state (+ optional: judge name, criminal history level). Returns sentencing range with real data.

**Data sources:** sentencing_distributions (JUSTFAIR), judge_sentencing_patterns (JUSTFAIR), outcome_benchmarks (BJS)

**Architecture:** 100% mechanical. No AI.
- Client component with dropdowns (charge type, state, optional judge name)
- API route: queries Supabase, returns structured JSON
- Client renders results: median sentence, p25-p75 range, guideline range, departure rate
- If judge name provided: judge-specific patterns vs district average
- Email capture gate: first query free, subsequent queries require email
- Upsell CTA: "Want the full analysis? → Judge Report Card ($197)"

**Files to create:**
- `src/app/tools/sentencing-calculator/page.tsx` — Landing + client component
- `src/app/api/tools/sentencing-calculator/route.ts` — API route with rate limiting
- JSON-LD: FAQPage + WebApplication schema

**Revenue model:** Free tool → email capture → drip sequence → Judge Report Card / Intelligence Brief upsell. Highest-intent free tool possible — every defendant wants to know their sentence range.

---

### 2B. Judge Comparison Tool — `/tools/judge-comparison`

**What it does:** User enters two judge names → side-by-side sentencing comparison.

**Data sources:** judge_sentencing_patterns, judge_demographics, judge_sentencing_demographics

**Architecture:** 100% mechanical.
- Two judge name inputs + state selector
- API queries both judges, returns comparison JSON
- Renders side-by-side table: median sentence, departure rates, demographics, racial disparity
- Email capture on second comparison
- Upsell: "Get the full report → Judge Report Card ($197)"

**Files to create:**
- `src/app/tools/judge-comparison/page.tsx`
- `src/app/api/tools/judge-comparison/route.ts`

**Use case:** Defendant assigned new judge, wants to compare. Defendant considering venue change motion.

---

## Part 3: New Standalone Products

### ~~3A. Prosecutor Report Card~~ — DEFERRED

**Why deferred:** JUSTFAIR has NO named-prosecutor data — only district-level. CL `judge_prosecutor_pairings` names prosecutors but only where motion grants/denials were recorded in opinions (sparse). A "Prosecutor Report Card" implies named-prosecutor intelligence we can't deliver yet. District-level prosecution patterns are absorbed into 3A below.

**Unblock condition:** Build CL opinion mining pipeline for named prosecutors + conviction/plea patterns. Revisit after Phase 3.

---

### 3A. District Court Intelligence ($97) — NEW SKU

**What it does:** "Weather report" for your courthouse — combines district-level prosecution data with courthouse operational intelligence. How busy is it, how fast do cases move, what are the odds, how does the prosecution typically operate in this district.

**Data sources:** JUSTFAIR (district sentencing + plea/trial rates + conviction patterns), BJS (national benchmarks), CL `judge_prosecutor_pairings` (district-level motion grant/deny aggregates — not named prosecutors), Measures for Justice (county-level, when ingested), NCSC court stats (future)

**Architecture:** Mechanical.
- Query: state + district → sentencing ranges, plea vs trial rates, conviction patterns, motion grant rates (aggregated from pairings), time-to-disposition (when MFJ available)
- Render: dashboard-style HTML with CSS-only bar charts, district vs national comparison columns
- Includes "Prosecution Patterns" section using aggregated judge_prosecutor_pairings for the district

**Why it works:** Lowest price point standalone ($97), broadest applicability (every defendant has a court), absorbs useful parts of Prosecutor Report Card without overpromising. Great upsell to Judge Report Card.

---

### 3B. Arrest Survival Kit ($47) — NEW SKU (Loss Leader)

**What it does:** Immediate post-arrest guidance + officer intel preview.

**Data sources:** Fatal Encounters (cross-ref arresting agency), NPI (officer employment preview), existing arrest-rights content

**Architecture:** Hybrid — some mechanical data lookup, some templated content.
- Query: state + arresting agency → agency incident history, officer employment patterns
- Render: rights checklist + agency context + "want full officer background? → $97"

**Why it works:** Ultra-low price captures the 2AM panic buyer who won't spend $197 yet. Email capture → drip → upsell ladder. The $47 pays for itself through conversions.

---

## Part 4: Data Integration to IB/X-Ray/War Room/Situation Room

### 4A. IBVariables.ts Expansion

New fields to add to `IBVariables` interface:

```typescript
// JUSTFAIR judge intelligence
judge_demographics_summary?: string;      // "Appointed by Obama (D), ABA Well Qualified, Harvard Law"
judge_sentencing_justfair?: string;       // "Median 36mo (p25: 24, p75: 60), 69% downward departures"
judge_racial_disparity?: string;          // "Sentences Black defendants 18% above median, Hispanic 5% below"
district_sentencing_context?: string;     // "District median for [charge]: 42mo, national: 48mo"
national_plea_benchmark?: string;         // "94% of federal cases resolve by plea (BJS)"

// Officer intelligence (when NPI ingested)
officer_employment_history?: string;      // "3 departments since 2015, separated from [dept] in 2019"
officer_fatal_encounter?: string;         // "Involved in fatal encounter: [date], [city]"
```

### 4B. Edge Function Query Expansion

`supabase/functions/generate-report/index.ts` needs additional queries:
- `judge_demographics` WHERE judge_name_normalized matches intake judge
- `judge_sentencing_demographics` WHERE judge matches + defendant race from intake
- `sentencing_distributions` WHERE district + charge_slug

Format results into the new IBVariables fields. Pass to prompt builders.

### 4C. Prompt Template Injection

| Section | New Variable | How It's Used |
|---------|-------------|---------------|
| Section 1 (Case Roadmap) | `district_sentencing_context`, `national_plea_benchmark` | Grounding: "In your district, cases like yours typically..." |
| Section 2 (What's Working) | `judge_sentencing_justfair`, `judge_racial_disparity` | "Your judge's sentencing patterns suggest..." |
| Section 3e (Judge Intel) | `judge_demographics_summary`, `judge_sentencing_justfair`, `judge_racial_disparity` | Full judge profile with data-backed analysis |
| Section 4 (Your Plan) | All of the above | AI synthesizes all data into case-specific guidance |

**AI still required** for IB — it needs to reason about how the data applies to THIS defendant's specific situation. But the data quality feeding the AI goes from thin to comprehensive.

---

## Part 5: Ingestion Scripts Needed

| Script | Input | Output Table | Priority |
|--------|-------|-------------|----------|
| `scripts/ingest-npi.mjs` | `data/external-intel/npi/us-post-data/db/data/output/` | `officer_external_intel` | HIGH — unlocks Officer Background Check |
| `scripts/ingest-fatal-encounters.mjs` | `data/external-intel/fatal-encounters/fatal-encounters.csv` | `officer_external_intel` or new `fatal_encounters` table | HIGH |
| `scripts/ingest-mpv.mjs` | `data/external-intel/mpv/police_killings.csv` | `officer_external_intel` | MEDIUM |
| `scripts/ingest-fbi-nibrs.mjs` | `data/external-intel/fbi-crime/FL-2024/*.csv` | New `nibrs_incidents` or enrichment to existing | LOW — complex schema, agency-level not officer-level |

---

## Implementation Phases

### Phase 1: Judge Report Card + Similar Cases (data already in DB)
- Wire JUSTFAIR into query.ts + render.ts for Judge Report Card
- Similar Cases already benefits (zero code changes)
- Update coverage.ts availability thresholds
- Update landing page copy to reflect data depth
- **Effort:** 1 session. **Impact:** $197 product transforms overnight.

### Phase 2: IB/X-Ray/WR/SR Variables Expansion
- Add JUSTFAIR fields to IBVariables
- Expand Edge Function queries
- Inject into prompt templates
- **Effort:** 1 session. **Impact:** Every $997+ report gets richer.

### Phase 3: Officer Background Check Data Depth
- Build + run NPI ingestion script
- Build + run Fatal Encounters ingestion script
- Update render.ts with employment history + fatal encounter sections
- **Effort:** 1 session. **Impact:** $97 product goes from thin to lethal.

### Phase 4: Free Tools (Sentencing Calculator + Judge Comparison)
- New pages, API routes, email capture
- **Effort:** 1-2 sessions. **Impact:** Top-of-funnel conversion machines.

### Phase 5: Case Decoder + Plea Analyzer + Score Enrichment
- Smaller changes, high cumulative impact
- **Effort:** 1 session. **Impact:** Every product touchpoint gets data context.

### Phase 6: New SKUs
- Prosecutor Report Card, District Court Intelligence, Arrest Survival Kit
- Each needs: tiers.ts entry, landing page, query function, render function, AvailabilityChecker
- **Effort:** 1 session each. **Impact:** New revenue lines.

### Phase 7: Blog Content Sprint
- 6+ data-driven posts using real aggregate statistics
- **Effort:** 1 session. **Impact:** SEO + trust + top-of-funnel.

---

## Non-Functional Requirements

- **No AI for mechanical outputs.** If a query + template produces the answer, use that.
- **Source citations on every data point.** JUSTFAIR → osf.io/nseh5, BJS → bjs.ojp.gov, USSC → ussc.gov, NPI → invisible.institute, CL → courtlistener.com
- **UPL compliance.** Factual data presentation only. No "this judge is favorable" or "you should request bench trial." Numbers and sources.
- **Data freshness tracking.** Each ingestion script logs to `data_source_freshness` table with source_key, last_refresh, row_count, source_url.
- **Graceful degradation.** If a dataset has no match for this judge/officer/district, omit the section. Never show empty tables or "no data available."
- **Availability expansion.** Every new data source should expand the number of judges/officers/districts that pass the availability check.

---

## Success Metrics

| Metric | Current | Target (30 days) |
|--------|---------|-----------------|
| Judge Report Card data sections | 5-6 | 8-9 (+ demographics, JUSTFAIR sentencing, racial disparity) |
| Judges passing availability check | ~100 (CL quotes only) | 1,126+ (JUSTFAIR demographics) |
| Officers passing availability check | ~30 (CL opinions only) | 500+ (NPI + Fatal Encounters) |
| sentencing_distributions rows | 32 | 1,977+ (done) |
| IB data context fields | ~5 tier9 variables | 10+ with JUSTFAIR fields |
| Free tool email captures | 0 | 50+/week (sentencing calculator) |
| New SKUs live | 0 | 2 (Prosecutor Report Card, District Court Intelligence) |
