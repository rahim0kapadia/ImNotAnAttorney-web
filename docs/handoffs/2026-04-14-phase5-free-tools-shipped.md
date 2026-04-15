# Handoff: Phase 5 Free Tools Shipped

Date: 2026-04-14 23:45

## Task
Defense Intelligence Integration plan — Phase 5: Build two free JUSTFAIR-powered tools (Sentencing Calculator + Judge Comparison) as lead gen / email capture instruments.

Plan: `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\plans\2026-04-14-defense-intelligence-integration.md`

## Approach
Extended the existing calculator infrastructure (`tools/[slug]` dynamic route + `CalculatorClient.tsx` wizard pattern) rather than building separate page components. Added "text" step type and `optional` step support to the wizard. Created dedicated API routes (not the generic `api/tools/[slug]` registry) since these tools query the DB asynchronously unlike the existing rule-based calculators.

## Files Modified
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\products.ts` — Added `sentencing-calculator` and `judge-comparison` entries (free, active, upsell to judge-report-card)
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\tools\sentencing-calculator\route.ts` — NEW. Queries judge_sentencing_patterns + sentencing_distributions + optional judge_demographics by state/charge/judge name. Rate limited 30/5min.
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\api\tools\judge-comparison\route.ts` — NEW. Parallel queryJudgeData() for two judges — demographics + sentencing patterns + racial disparity. Rate limited 20/5min.
- `C:\Users\email\projects\ImNotAnAttorney-web\src\app\tools\[slug]\CalculatorClient.tsx` — Added: "text" step type, optional step support (canProceed allows empty on optional steps), FEDERAL_STATES (51 options), SENTENCING_CALC_STEPS (3 steps, judge name optional), JUDGE_COMPARISON_STEPS (2 text steps), SentencingCalcResult + JudgeComparisonResult interfaces, type guards, full result renderers with tables/cards/demographics/racial disparity.

## What Didn't Work
- Parallel Edit calls to same file get blocked by enforce-thrash-limit hook — need one diagnostic step (Read/Grep) between each edit to the same file
- Supabase PromiseLike vs Promise: pushing PostgREST queries into `Promise<unknown>[]` fails TypeScript. Fixed by using destructured `Promise.all([q1, q2, q3 ?? Promise.resolve(null)])` pattern.

## Remaining Steps — Defense Intelligence Integration Plan

### Completed (Phases 1-5)
- Phase 1: Judge Report Card JUSTFAIR integration
- Phase 2: IB/X-Ray/WR/SR variables expansion
- Phase 3: Officer Background Check data depth (NPI ingestion IN PROGRESS — AZ done, CA ~28%, GA pending)
- Phase 4: Case Decoder + Plea Analyzer enrichment (Task 4.3 Score page deferred — needs API route for client component)
- Phase 5: Free tools (this session)

### Next: Phase 6 — New SKUs + Sample Page Updates
1. **Task 6.1: District Court Intelligence ($97)** — New SKU in tiers.ts, landing page, query + render functions, coverage check
2. **Task 6.2: Arrest Survival Kit ($47)** — New SKU, landing page, agency-level data from officer_external_intel
3. **Task 6.3: Update sample report pages** — `/sample/` and `/sample-xray/` must show new JUSTFAIR sections

### Phase 7 — Remaining Product Surfaces + Blog + Partner
4. Task 7.1: Similar Cases + Officer Background landing page updates
5. Task 7.2: Blog content sprint (6 data-driven posts)
6. Task 7.3: Partner Portal trust signal
7. Task 7.4: Update SCHEMA.md with new tables (judge_demographics, judge_sentencing_demographics)
8. Task 7.5: Secondary pages data enrichment sweep (15+ routes)

### Deferred
- Task 4.3: Score page contextual enrichment — ScoreClient.tsx is a client component, needs an API route to fetch sentencing_distributions + outcome_benchmarks
- NPI ingestion still running — monitor completion, then verify Officer Background Check renders employment history

## Verification
- `npx tsc --noEmit --skipLibCheck` — TypeScript clean (confirmed)
- `git log --oneline -3` — Commit e74515c confirms Phase 5
- Visit `/tools/sentencing-calculator` and `/tools/judge-comparison` after deploy to verify end-to-end
- NPI ingestion: check `data_source_freshness` table for source_key='npi' once script completes

## Key Decisions
- Used wizard pattern (not flat form) for both new tools — consistency with existing calculators
- Sentencing calculator has optional judge name as last step — Calculate button works with empty field
- Judge comparison uses amber/blue color coding for Judge A/B throughout all result sections
- Federal courts only — clearly labeled in every result view with JUSTFAIR source link
- Upsell CTA points to judge-report-card (not case-decoder like existing calculators)
- Both API routes have their own route files (not added to CALCULATOR_REGISTRY in the generic route) because they do async DB queries
