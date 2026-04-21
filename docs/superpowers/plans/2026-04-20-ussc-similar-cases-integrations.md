# USSC Similar Cases Matview — Product Integrations Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the `ussc_similar_cases_summary` matview (landed 2026-04-20) to three product surfaces — new `/api/tools/similar-cases` (powers the $297 product), upgraded `/api/plea-analyzer` (adds real trial-tax math), upgraded `/api/tools/sentencing-calculator` (adds district-specific perspective).

**Architecture:** One shared query library (`src/lib/ussc-similar-cases.ts`) does bucket-fetch with progressive widening (drop age → drop citizen → drop district). Three routes consume it. Existing routes stay backward-compatible — new fields are additive. All customer-facing language stays UPL-safe (information not advice, no "should"). Sample size always disclosed.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, `@supabase/supabase-js` with service role, Vitest for tests, existing `createAdminClient`, `checkRateLimit`, `getClientIp` helpers.

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `src/lib/ussc-similar-cases.ts` | Shared matview fetch + progressive widening + response shaping | Create |
| `src/app/api/tools/similar-cases/route.ts` | POST endpoint for $297 Similar Cases product | Create |
| `src/app/api/plea-analyzer/route.ts` | Add matview plea-vs-trial lookup to `sentencingContext` | Modify |
| `src/app/api/tools/sentencing-calculator/route.ts` | Add district-specific perspective to response | Modify |
| `tests/api/similar-cases.test.ts` | Integration — new route happy-path + widening + insufficient-data | Create |
| `tests/api/plea-analyzer-matview.test.ts` | Integration — plea-analyzer matview augmentation | Create |
| `tests/api/sentencing-calculator-matview.test.ts` | Integration — sentencing-calc district perspective | Create |
| `tests/lib/ussc-similar-cases.test.ts` | Unit — widening logic, normalization | Create |

Fixture bucket (verified live): `district='42', offguide='17', xcrhissr='1', citizen='3'` has 9 rows across age buckets. `age_bucket='25-34', plea_or_trial='0'` = 7033 cases, median 3.13 months; `plea_or_trial='1'` = 6 cases, median 25.5 months.

---

## Task 1: Shared matview query library

**Files:**
- Create: `src/lib/ussc-similar-cases.ts`
- Create: `tests/lib/ussc-similar-cases.test.ts`

- [ ] **Step 1: Write the failing test (unit)**

Test file content defined in Task 1 Step 1 of the implementation (see below — code inline with route work).

- [ ] **Step 2: Write library with `normalizeAgeBucket`, `queryBucket`, `extractPleaTrialSplit`, `computeTrialTaxMonths`**

Key behaviors:
- `normalizeAgeBucket(age)` → `'<25' | '25-34' | '35-44' | '45-54' | '55+' | 'UNK'`
- `queryBucket(sb, input)` runs 4 queries max: exact → drop age → drop citizen → drop district (national). Returns `{ match_depth, widening_note, rows, total_cases, sample_size_caveat }`.
- `extractPleaTrialSplit(rows)` picks largest-sample row per `plea_or_trial` code (`'0'`=plea, `'1'`=trial).
- `computeTrialTaxMonths(plea, trial)` returns `trial.median_senttot - plea.median_senttot` or null.

- [ ] **Step 3: Commit**

```
feat(ussc): add shared matview query lib with progressive widening
```

---

## Task 2: New Similar Cases route (`$297 product`)

**Files:**
- Create: `src/app/api/tools/similar-cases/route.ts`
- Create: `tests/api/similar-cases.test.ts`

- [ ] **Step 1: Test with mocked Supabase (per `court-reminders-rate-limit.test.ts` pattern)**

Test scenarios:
1. Exact match with both plea+trial rows returns `match_depth: "exact"`, correct totals, UPL-safe (no "you should" / "we recommend").
2. Widening — when exact returns empty but district+offguide+xcrhissr+citizen returns rows, `match_depth: "widened_age"`.
3. All widening empty → `match_depth: "insufficient_data"`, `outcomes.plea === null`.
4. Missing required field → 400 with validation errors.
5. Missing age → normalizes to `UNK`, triggers widening automatically.

- [ ] **Step 2: Write route**

Input: `{ district, offguide, xcrhissr, citizen, age? }`.
Output: `{ result: { input, match_depth, widening_note, total_cases, sample_size_caveat, outcomes: { plea, trial }, trial_tax_months, federalOnly, dataSource, sourceUrl, disclaimer } }`.

Rate limit: 30 per 5 min per IP (matches judge-comparison). Analytics RPC fire-and-forget.

Disclaimer copy (UPL-safe): `"This shows legal INFORMATION about what similar federal cases resulted in — not legal advice. Every case is different; your attorney remains the final authority on strategy."`

- [ ] **Step 3: Commit**

```
feat(similar-cases): add $297 product API route backed by USSC matview
```

---

## Task 3: Upgrade Plea Analyzer — real trial tax

**Files:**
- Modify: `src/app/api/plea-analyzer/route.ts`
- Create: `tests/api/plea-analyzer-matview.test.ts`

Existing body parses `{ email, state, chargeType, pleaOfferDetails, originalCharges, offeredCharges, sentencingExposure }`. Extend body parsing to also read optional `district`, `offguide`, `xcrhissr`, `citizen`, `age`. When all of (`district`, `offguide`, `xcrhissr`) present, run `queryBucket` + `extractPleaTrialSplit` + `computeTrialTaxMonths` and append to the existing `sentencingContext` string:

```
District plea median: <N> months (N=<cases>). District trial median: <N> months (N=<cases>). Observed trial tax: <delta> months (<exact|widened_*>). Source: USSC Individual Offender Datafiles FY14-FY24.
```

If either plea or trial missing → skip the addendum (keep existing context unchanged).

Tests:
1. With district bucket fields + both outcomes present → context contains "trial tax" and the computed delta.
2. Without district fields → matview query skipped, existing context preserved.
3. With district fields but only plea row → no trial-tax line.

- [ ] **Step 1: Test file**
- [ ] **Step 2: Route edit — imports + body-field parsing + matview block + non-fatal error handling**
- [ ] **Step 3: Commit**

```
feat(plea-analyzer): surface real trial-tax from USSC matview when bucket supplied
```

---

## Task 4: Upgrade Sentencing Calculator — district perspective

**Files:**
- Modify: `src/app/api/tools/sentencing-calculator/route.ts`
- Create: `tests/api/sentencing-calculator-matview.test.ts`

Extend `SentencingInput` with optional `district`, `offguide`, `xcrhissr`, `citizen`, `age`. Extend `validate` to type-check when provided. After existing Promise.all block, if all of (`district`, `offguide`, `xcrhissr`) present, run `queryBucket` and attach `districtDistribution` field to response:

```ts
districtDistribution: {
  match_depth, widening_note, total_cases, sample_size_caveat,
  outcomes: { plea, trial },
  trial_tax_months,
} | null
```

Existing response fields (`districtPatterns`, `chargeDistribution`, `judgePattern`, `judgeDemographics`, `federalOnly`, `dataSource`, `sourceUrl`) stay. This gives consumers three perspectives:
- `chargeDistribution` → national guideline distribution (existing)
- `judgePattern` / `judgeDemographics` → this judge (existing)
- `districtDistribution` → THIS DISTRICT's plea+trial outcomes for THIS offguide+xcrhissr (new)

Update the `dataSource` string to `"USSC/JUSTFAIR FY2001-FY2024 (690K+ federal sentencing records)"`. Add `disclaimer` field with UPL-safe copy.

Tests:
1. With district fields + matview rows → `districtDistribution.match_depth === "exact"` with populated `outcomes.plea`.
2. Without district fields → `districtDistribution === null`, existing contract intact.
3. With district fields but matview miss → `districtDistribution.match_depth === "insufficient_data"`.

- [ ] **Step 1: Test file**
- [ ] **Step 2: Route edit**
- [ ] **Step 3: Commit**

```
feat(sentencing-calc): add district-specific perspective from USSC matview
```

---

## Task 5: Typecheck, regression, merge

- [ ] `npx tsc --noEmit` → zero errors.
- [ ] `npm test -- tests/lib/ussc-similar-cases.test.ts tests/api/similar-cases.test.ts tests/api/plea-analyzer-matview.test.ts tests/api/sentencing-calculator-matview.test.ts` → all pass.
- [ ] `npm test` → full suite no regressions.
- [ ] Final commit + branch ready for PR (one branch, four commits per task).

---

## Cascade

- Customers (defendants): real distributions for their exact federal case profile, not charge-slug aggregates.
- Us: $297 Similar Cases Analyzer has genuine defensibility; plea-analyzer moves from "estimate" to "observed" trial tax.
- Rahim: no per-case analyst time — lookups are instant.
- Future-us: matview refresh on annual USSC load is one line; extend same pattern when drug-type / 5K1 / role-adjustment cols ingest.
- Ecosystem: pattern portable to any bucket-distribution dataset.
