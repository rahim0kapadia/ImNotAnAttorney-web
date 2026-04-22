# USSC Intake Wiring — Bucket 1 (2026-04-21)

## Goal

Wire the USSC matview bucket fields (priorConvictions, citizenship, ageBucket)
into three product intake forms so the $297 Similar Cases Analyzer, free
Plea Analyzer, and free Sentencing Calculator actually feed data to the
`ussc_similar_cases_summary` matview integration shipped in PR #7.

District field intentionally left out — USSC Codebook Appendix A (PDF only)
contains the canonical 94-district mapping; hand-coding risks wrong legal
data per rules/no-hallucinated-legal-data.md. API + lib now accept district
as optional and widen straight to national when absent. State→district
mapping is a future enhancement.

## Expert Synthesis

- **Peep Laja (CRO):** every field added kills conversion linearly. Defendants
  at 2AM post-arrest have under 60s patience. All 3 new fields are OPTIONAL.
- **Chris Dreyer (legal-services niche):** UPL hedge is the moat. Widening
  disclosure is non-negotiable. Answers → distribution data, never advice.
- **Atti (crisis-buyer psychology):** 80% stress = 80% processing reduction.
  Friendly labels ("Prior convictions?" not "USSC xcrhissr code"). Collapsed
  `<details>` pattern on free tools so critical path stays lean.

## Files to Create

- `src/lib/ussc-mappings.ts` — 3 mappers + combined `mapIntakeToBucket`
- `tests/lib/ussc-mappings.test.ts` — 20 unit tests

## Files to Modify

- `src/lib/ussc-similar-cases.ts` — make `district`, `citizen`, `age_bucket`
  optional on `BucketInput`; progressive widening skips tiers when filters absent
- `src/app/api/tools/similar-cases/route.ts` — accept optional district /
  citizen / age / age_bucket; validate; pass through to `queryBucket`
- `tests/api/similar-cases.test.ts` — update "missing age" test (now `null`
  not `"UNK"`), add "missing district" widened_district test, add
  required-field 400 tests
- `src/lib/products.ts` — expand `similar-cases-analyzer.intakeFields` to
  include priorConvictions, citizenship, ageBucket
- `src/app/intake/standalone/[slug]/IntakeFormClient.tsx` — add 3 optional
  `<select>` fields to the `similar-cases-analyzer` FIELD_SETS entry
- `src/app/api/intake/standalone/[slug]/route.ts` — extend
  `VALID_PRIOR_CONVICTIONS` to include "dont-know"; add `VALID_AGE_BUCKETS`;
  mark all 3 fields as optional for slug; add validators for citizenship
  and ageBucket
- `src/lib/tier9-reports/render.ts` — add `UsscDistribution` type +
  `reshapeMatviewRow` helper + `renderUsscDistribution` section;
  extend `renderSimilarCases` signature with optional 4th `ussc` param
- `src/lib/tier9-reports/generate.ts` — for `similar-cases-analyzer`,
  dynamic-import `mapIntakeToBucket` + `queryBucket`; query matview when
  signal sufficient; pass result to `renderSimilarCases`. On failure fall
  back to existing CourtListener-only report
- `src/app/plea-analyzer/PleaAnalyzerClient.tsx` — add 3 optional state
  vars + `<details>` collapsible section + pass to POST body
- `src/app/tools/[slug]/CalculatorClient.tsx` — same pattern for
  sentencing-calculator (scoped by slug)

## Numbered Tasks

1. Data discovery: query matview for distinct district / offguide / citizen /
   xcrhissr / age_bucket values. DONE.
2. Build `ussc-mappings.ts` + tests. DONE.
3. Update `ussc-similar-cases.ts` + `similar-cases/route.ts` + tests for
   optional district / citizen / age. DONE.
4. Update `products.ts` + `IntakeFormClient.tsx` + standalone intake
   validator route. DONE.
5. Update `render.ts` + `generate.ts` for matview augmentation. DONE.
6. Update `PleaAnalyzerClient.tsx` — 3 optional fields + POST passthrough. IN PROGRESS.
7. Update `CalculatorClient.tsx` — same pattern.
8. Run typecheck + full vitest regression.
9. Commit + push to existing feature branch (updates PR #7).

## Success Criteria

- `npx tsc --noEmit` clean.
- All 20+ mappings tests pass.
- All existing 472 tests still pass.
- All 3 new intake form fields are optional (zero forced additions).
- Every intake label uses "information" / "distribution" framing, never
  "prediction" / "your case will" / "likely outcome".
- When user omits new optional fields, matview query gracefully widens
  and the report discloses widening (sample_size_caveat + widening_note).
- Report never shows UPL-violating language.

## Out of Scope

- State → federal district mapping (PDF-only source, hand-code risk)
- Drug-type / 5K1 / role-adjustment enrichment (not ingested yet)
- Changes to the existing CourtListener-backed sections
- New Stripe product / pricing changes

## Cascade

- Customers (defendants): honest data, not false precision. Widening
  disclosure lets them weigh the match.
- Us: $297 product now backed by both CourtListener + USSC distribution.
- Rahim: no new analyst workflow.
- Future-us: richer intake (drug type, role) extends mappers without
  refactor.
