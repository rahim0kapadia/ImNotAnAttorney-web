# Defense Intelligence Data Integration, Implementation Plan (v3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire 7 external datasets (JUSTFAIR 595K sentencing, NPI, Fatal Encounters, FBI NIBRS, MPV, BJS, USSC) into every INAA product, transforming existing products and launching new ones.

**Architecture:** Mechanical-over-AI. Tier 9 products use query → template → HTML (no Claude API). IB/X-Ray/WR/SR use AI but grounded on richer data context. Free tools are 100% mechanical. All data queries route through `defense-intelligence/query.ts` (designated single query surface). Edge Functions use raw PostgREST fetch (Deno).

**Tech Stack:** Next.js 15 (App Router), Supabase (PostgREST + Management API), TypeScript, Deno Edge Functions

**Spec:** `docs/superpowers/specs/2026-04-14-defense-intelligence-integration-design.md`

**Review history:** v1 reviewed by code-reviewer + code-simplifier agents. 2 critical bugs, 6 important fixes, 11 simplifications. All incorporated into v2. See `memory/feedback-plan-review-defense-intel.md` for full review log.

---

## File Map

| File | Role | Phases |
|------|------|------, |
| `src/lib/defense-intelligence/query.ts` | All new JUSTFAIR queries live here (designated single query surface) | 1 |
| `src/lib/tier9-reports/query.ts` | Fix bench_jury bug, add justfair field to JudgeReportCardData | 1 |
| `src/lib/tier9-reports/render.ts` | New JUSTFAIR HTML sections for Judge Report Card + Officer Background | 1, 3 |
| `src/lib/tier9-reports/generate.ts` | Call queryJustfairJudge, pass to render | 1 |
| `src/lib/tier9-reports/coverage.ts` | Add JUSTFAIR to availability check | 1 |
| `src/app/judge-report-card/page.tsx` | Update landing page copy | 1 |
| `src/lib/intelligence-brief/variables.ts` | Add JUSTFAIR fields to IBVariables | 2 |
| `src/lib/intelligence-brief/prompts.ts` | Inject existing + new variables into sections | 2 |
| `supabase/functions/generate-report/index.ts` | PostgREST queries + buildIBVariables sync (Deno, raw fetch) | 2, 4 |
| `supabase/functions/generate-standalone/index.ts` | Plea Analyzer sentencing context (NOT generate-report) | 4 |
| `src/app/api/plea-analyzer/route.ts` | Query sentencing context before Edge Function call | 4 |
| `src/app/score/ScoreClient.tsx` | Contextual sentencing data below score | 4 |
| `src/lib/products.ts` | Register new calculator tools in catalog | 5 |
| `src/app/tools/[slug]/CalculatorClient.tsx` | New sentencing calculator + judge comparison components | 5 |
| `src/lib/tiers.ts` | New SKU entries (District Court Intelligence, Arrest Survival Kit) | 6 |

**CRITICAL WARNING, Edge Function duplication:** `supabase/functions/generate-report/index.ts` contains a COPY of `buildIBVariables()` (line ~4433) that mirrors `src/lib/intelligence-brief/variables.ts`. Both must be updated in sync. The Edge Function version returns `Record<string, string>` (untyped), NOT the typed `IBVariables` interface. Any field added to variables.ts MUST also be added to the Edge Function copy.

---

## Phase 1: Judge Report Card JUSTFAIR Integration

**Impact:** $197 product transforms overnight. 1,126 federal judges gain demographics, sentencing patterns, racial disparity data. Availability expands from ~100 to 1,126+.

### Task 1.1: Fix bench_jury bug + add JUSTFAIR queries to DI module

**Files:**
- Modify: `src/lib/tier9-reports/query.ts:305-312` (bench_jury fix)
- Modify: `src/lib/defense-intelligence/query.ts` (new JUSTFAIR types + query function)

- [ ] **Step 1: Fix bench_jury fallback to use state_code**

In `src/lib/tier9-reports/query.ts`, find the district-level bench_jury fallback (~line 305-312). Replace:

```typescript
// BEFORE (broken):
supabase
  .from("bench_jury_divergence")
  .select(BENCH_JURY_SELECT)
  .ilike("district", `%${safeStateName}%`)
  .is("judge_id", null)
  .order("jury_sample", { ascending: false })
  .limit(20),
```

With:

```typescript
// AFTER (uses indexed state_code):
supabase
  .from("bench_jury_divergence")
  .select(BENCH_JURY_SELECT)
  .eq("state_code", intake.state.toUpperCase())
  .is("judge_id", null)
  .order("jury_sample", { ascending: false })
  .limit(20),
```

Remove `stateName` and `safeStateName` variables if no longer referenced elsewhere (grep first).

- [ ] **Step 2: Add JUSTFAIR types to defense-intelligence/query.ts**

Append after `DefenseIntelligenceData` interface (~line 88):

```typescript
// ============================================================
// JUSTFAIR TYPES (federal sentencing + judge demographics)
// Source: osf.io/nseh5, 595,851 federal sentencing records
// FEDERAL COURTS ONLY, state court judges return isEmpty=true
// ============================================================

export interface JudgeDemographics {
  judge_name: string;
  judge_name_normalized: string;
  district: string | null;
  gender: string | null;
  race_ethnicity: string | null;
  appointing_president: string | null;
  appointing_party: string | null;
  aba_rating: string | null;
  birth_year: number | null;
  law_school: string | null;
  senior_status_date: string | null;
  active_start: number | null;
  active_end: number | null;
  source_urls: string[];
}

export interface JudgeSentencingByRace {
  defendant_race: string;
  total_cases: number;
  median_sentence_months: number | null;
  mean_sentence_months: number | null;
  guideline_departure_rate: number | null;
  avg_departure_pct: number | null;
}

export interface JustfairJudgeData {
  demographics: JudgeDemographics | null;
  sentencingByRace: JudgeSentencingByRace[];
  isEmpty: boolean;
}
```

Note: District-level sentencing comparison uses the EXISTING `usscPatterns` field from `queryJudgeReportCard()`, which already queries `judge_sentencing_patterns` (line 328-332 of query.ts). JUSTFAIR rows are in the same table with `sources @> '{JUSTFAIR}'`. No separate districtSentencing field needed, the existing query already returns JUSTFAIR data.

- [ ] **Step 3: Add queryJustfairJudge function**

Append after `queryDefenseIntelligence()`:

```typescript
/**
 * Query JUSTFAIR judge demographics + racial disparity data.
 * FEDERAL COURTS ONLY, 1,126 judges in database.
 * State court judges will return isEmpty=true.
 */
export async function queryJustfairJudge(
  judgeName: string
): Promise<JustfairJudgeData> {
  const supabase = createAdminClient();
  const safeName = judgeName.toLowerCase().replace(/[%_\\]/g, (ch) => `\\${ch}`);

  const [demoResult, raceResult] = await Promise.all([
    supabase
      .from("judge_demographics")
      .select("*")
      .ilike("judge_name_normalized", `%${safeName}%`)
      .limit(1),

    supabase
      .from("judge_sentencing_demographics")
      .select("defendant_race, total_cases, median_sentence_months, mean_sentence_months, guideline_departure_rate, avg_departure_pct")
      .ilike("judge_name_normalized", `%${safeName}%`)
      .gte("total_cases", MINIMUM_SAMPLE_SIZE)
      .order("total_cases", { ascending: false }),
  ]);

  const demographics = (demoResult.data?.[0] as JudgeDemographics) ?? null;
  const sentencingByRace = (raceResult.data ?? []) as JudgeSentencingByRace[];

  return {
    demographics,
    sentencingByRace,
    isEmpty: !demographics && sentencingByRace.length === 0,
  };
}
```

---

### Task 1.2: Wire JUSTFAIR into Judge Report Card generation + render

**Files:**
- Modify: `src/lib/tier9-reports/query.ts` (add justfair field to JudgeReportCardData)
- Modify: `src/lib/tier9-reports/generate.ts` (call queryJustfairJudge)
- Modify: `src/lib/tier9-reports/render.ts` (3 new HTML sections)

- [ ] **Step 1: Extend JudgeReportCardData**

In `query.ts`, add to the `JudgeReportCardData` interface:

```typescript
import type { JustfairJudgeData } from "@/lib/defense-intelligence/query";

// Add to interface:
justfair?: JustfairJudgeData | null;
```

- [ ] **Step 2: Call queryJustfairJudge in generate.ts**

In `generate.ts`, import and call after `queryJudgeReportCard()`:

```typescript
import { queryJustfairJudge } from "@/lib/defense-intelligence/query";

// Inside judge-report-card case, after existing query:
const justfairData = await queryJustfairJudge(intake.judgeName);
data.justfair = justfairData;
```

Note: variable is `data` (not `reportCardData`), verified in generate.ts line ~110.

- [ ] **Step 3: Add module-level formatting helpers to render.ts**

Near the top of render.ts, after existing helpers like `sourceLink`:

```typescript
/** Format months value for sentencing display */
function fmtMonths(v: number | null): string {
  return v !== null ? `${v.toFixed(1)} mo` : ", ";
}

/** Format decimal as percentage */
function fmtPct(v: number | null): string {
  return v !== null ? `${(v * 100).toFixed(1)}%` : ", ";
}
```

- [ ] **Step 4: Add JUSTFAIR demographics section in renderJudgeReportCard()**

After the existing Judge Profile table, add:

```typescript
  // JUSTFAIR Judge Background (federal courts only)
  if (data.justfair?.demographics) {
    const d = data.justfair.demographics;
    body += sectionHeader("Judge Background, Federal Court Intelligence");
    body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 12px;">Source: JUSTFAIR (QSIDE Institute), USSC FY2001-2023. Federal courts only. <a href="https://osf.io/nseh5/" style="color: #F59E0B;">[source]</a></p>`;
    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">`;

    const rows: [string, string | null][] = [
      ["Appointed By", d.appointing_president ? `${escapeHtml(d.appointing_president)} (${escapeHtml(d.appointing_party ?? "Unknown")})` : null],
      ["ABA Rating", d.aba_rating],
      ["Law School", d.law_school],
      ["Gender", d.gender],
      ["Active", d.active_start ? `${d.active_start}–${d.active_end ?? "present"}` : null],
      ["Senior Status", d.senior_status_date ?? "No"],
    ];

    for (const [label, value] of rows) {
      if (!value) continue;
      body += `<tr>
        <td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">${escapeHtml(label)}</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${value}</td>
      </tr>`;
    }
    body += `</table>`;
    totalSources++;
  }
```

- [ ] **Step 5: REPLACE existing USSC sentencing section with enhanced version**

render.ts already has a "Federal Sentencing Intelligence (USSC Data)" section at lines ~130-154 that renders `data.usscPatterns`. **REPLACE that section** (do NOT add alongside it, that would duplicate the same data). The new version uses the hoisted `fmtMonths`/`fmtPct` helpers and includes the JUSTFAIR source citation:

```typescript
  // REPLACES the existing "Federal Sentencing Intelligence (USSC Data)" section (~lines 130-154)
  // Remove the old section and replace with this enhanced version:
  if (data.usscPatterns) {
    const s = data.usscPatterns;
    body += sectionHeader("Sentencing Intelligence, 595,851 Federal Cases Analyzed");
    body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 12px;">This judge's sentencing patterns from USSC/JUSTFAIR data. <a href="https://osf.io/nseh5/" style="color: #F59E0B;">[source]</a></p>`;

    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr>
        <th style="padding: 8px 16px; color: #A1A1AA; border-bottom: 2px solid #292524; text-align: left;"></th>
        <th style="padding: 8px 16px; color: #F59E0B; border-bottom: 2px solid #292524; text-align: right;">This Judge</th>
      </tr></thead><tbody>`;

    body += `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Total Cases</td><td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${s.total_cases?.toLocaleString() ?? ", "}</td></tr>`;
    body += `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Median Sentence</td><td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${fmtMonths(s.median_sentence_months)}</td></tr>`;
    body += `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Range (P25–P75)</td><td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${fmtMonths(s.p25_sentence_months)} – ${fmtMonths(s.p75_sentence_months)}</td></tr>`;
    body += `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Downward Departures</td><td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${fmtPct(s.downward_departure_rate)}</td></tr>`;
    body += `<tr><td style="padding: 8px 16px; color: #A1A1AA; border-bottom: 1px solid #1C1917;">Upward Departures</td><td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${fmtPct(s.upward_departure_rate)}</td></tr>`;

    body += `</tbody></table>`;
    totalSources++;
  }
```

- [ ] **Step 6: Add JUSTFAIR racial disparity section**

After sentencing comparison:

```typescript
  // JUSTFAIR Sentencing by Defendant Demographics
  if (data.justfair?.sentencingByRace && data.justfair.sentencingByRace.length > 0) {
    body += sectionHeader("Sentencing by Defendant Demographics");
    body += `<p style="color: #A1A1AA; font-size: 13px; margin-bottom: 12px;">Factual sentencing data by defendant race for this judge. No editorial interpretation. <a href="https://osf.io/nseh5/" style="color: #F59E0B;">[source]</a></p>`;

    body += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <thead><tr>
        <th style="padding: 8px 16px; color: #A1A1AA; border-bottom: 2px solid #292524; text-align: left;">Defendant Race</th>
        <th style="padding: 8px 16px; color: #A1A1AA; border-bottom: 2px solid #292524; text-align: right;">Cases</th>
        <th style="padding: 8px 16px; color: #A1A1AA; border-bottom: 2px solid #292524; text-align: right;">Median Sentence</th>
        <th style="padding: 8px 16px; color: #A1A1AA; border-bottom: 2px solid #292524; text-align: right;">Departure Rate</th>
      </tr></thead><tbody>`;

    for (const row of data.justfair.sentencingByRace) {
      body += `<tr>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917;">${escapeHtml(row.defendant_race)}</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${row.total_cases.toLocaleString()}</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${fmtMonths(row.median_sentence_months)}</td>
        <td style="padding: 8px 16px; color: #FAFAF9; border-bottom: 1px solid #1C1917; text-align: right;">${fmtPct(row.guideline_departure_rate)}</td>
      </tr>`;
    }

    body += `</tbody></table>`;
    totalSources++;
  }
```

---

### Task 1.3: Update coverage check + landing page

**Files:**
- Modify: `src/lib/tier9-reports/coverage.ts`
- Modify: `src/app/judge-report-card/page.tsx`

- [ ] **Step 1: Add JUSTFAIR to checkJudgeCoverage()**

Add JUSTFAIR demographics check to the EXISTING `Promise.all` array (lines 57-63), not as a separate sequential await:

```typescript
  const [quotes, sentencing, pairings, appellate, divergence, justfairDemo] = await Promise.all([
    supabase.from("judge_quotes").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    supabase.from("sentencing_distributions").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    supabase.from("judge_prosecutor_pairings").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    supabase.from("appellate_trends").select("id", { count: "exact", head: true }).eq("jurisdiction", state),
    supabase.from("bench_jury_divergence").select("id", { count: "exact", head: true }).eq("judge_id", judgeId),
    // JUSTFAIR federal judge demographics (1,126 judges)
    supabase.from("judge_demographics").select("judge_name", { count: "exact", head: true })
      .ilike("judge_name_normalized", `%${safeName.toLowerCase()}%`),
  ]);

  const coverage = {
    quotes: quotes.count ?? 0,
    sentencing: sentencing.count ?? 0,
    pairings: pairings.count ?? 0,
    appellate: appellate.count ?? 0,
    benchJury: divergence.count ?? 0,
    justfairDemographics: justfairDemo.count ?? 0,
  };

  // Available if CL data OR JUSTFAIR data exists
  const available =
    coverage.quotes >= 5 || coverage.sentencing >= 1 || coverage.pairings >= 1 ||
    coverage.justfairDemographics >= 1;
```

Handle the case where `judgeId` is null (no CL match), the CL queries will return 0, but the JUSTFAIR query uses the name directly, so it still works.

- [ ] **Step 2: Update landing page copy**

In `src/app/judge-report-card/page.tsx`, find the "What You Get" feature list. Add:
- "Judge background: appointing president, ABA rating, law school"
- "Sentencing patterns backed by 595,851 federal cases"
- "Defendant demographic sentencing analysis"
- Note: "Federal court data from JUSTFAIR (QSIDE Institute). State court data from CourtListener."

- [ ] **Step 3: Run TypeScript check + commit Phase 1**

```bash
npx tsc,noEmit,skipLibCheck
git add src/lib/defense-intelligence/query.ts src/lib/tier9-reports/query.ts src/lib/tier9-reports/generate.ts src/lib/tier9-reports/render.ts src/lib/tier9-reports/coverage.ts src/app/judge-report-card/page.tsx
git commit -m "feat(tier9): JUSTFAIR integration, Judge Report Card demographics, sentencing, racial disparity"
```

- [ ] **Step 4: E2E validation**

```bash
node scripts/e2e-tier9.mjs
```

Spot-check: "Amy Berman Jackson" (D.C. District, Obama, Harvard Law, 69% downward departures). Verify demographics + sentencing + racial disparity sections appear in rendered HTML.

---

## Phase 2: IB/X-Ray/WR/SR Variables Expansion

**Impact:** Every $997+ report gets richer data context. Wires both EXISTING unused fields and new JUSTFAIR fields.

### Task 2.1: Wire all IB variables + Edge Function queries

**Files:**
- Modify: `src/lib/intelligence-brief/variables.ts`
- Modify: `src/lib/intelligence-brief/prompts.ts`
- Modify: `supabase/functions/generate-report/index.ts` (Deno, raw PostgREST fetch)

**CRITICAL:** The Edge Function has a DUPLICATED `buildIBVariables()` at line ~4433 that must be updated IN SYNC with variables.ts. The Edge Function version returns `Record<string, string>` (untyped).

- [ ] **Step 1: Wire existing unused fields in prompts.ts**

`outcome_benchmarks_summary` (line 175) and `sentencing_range_context` (line 176) are declared in IBVariables but never injected. Wire them:

In `buildCaseRoadmap()` (Section 1), add:
```typescript
${v.sentencing_range_context ? `<sentencing_context>\n${v.sentencing_range_context}\n</sentencing_context>` : ""}
${v.outcome_benchmarks_summary ? `<outcome_benchmarks>\n${v.outcome_benchmarks_summary}\n</outcome_benchmarks>` : ""}
```

Same injection in `buildWhatsWorking()` (Section 2) and `buildCaseIntelligence()` (Section 3e).

- [ ] **Step 2: Add JUSTFAIR fields to IBVariables**

In `variables.ts`, after the existing "External Intelligence Layer" fields (line 176):

```typescript
  // JUSTFAIR judge intelligence (federal courts)
  judge_demographics_summary?: string;
  judge_sentencing_justfair?: string;
  judge_racial_disparity?: string;
```

- [ ] **Step 3: Add PostgREST queries in Edge Function**

In `supabase/functions/generate-report/index.ts`, in the Phase A handler (~line 4151), add queries using the existing `supabaseSelect()` wrapper (NOT raw fetch, use the wrapper already in the file at line ~107):

```typescript
// JUSTFAIR judge demographics
const judgeNameNorm = encodeURIComponent(judgeName.toLowerCase());
const judgeDemoUrl = `${SUPABASE_URL}/rest/v1/judge_demographics?judge_name_normalized=ilike.*${judgeNameNorm}*&limit=1`;

// Sentencing context (URL-encode spaces!)
const chargeSlugEnc = encodeURIComponent(chargeSlug);
const sentDistUrl = `${SUPABASE_URL}/rest/v1/sentencing_distributions?charge_slug=eq.${chargeSlugEnc}&select=median_months,p25,p75,sample_size&limit=5`;

// Outcome benchmarks
const obUrl = `${SUPABASE_URL}/rest/v1/outcome_benchmarks?offense_type=eq.${encodeURIComponent("all offenses")}&jurisdiction_level=eq.national&limit=1`;
```

Format results into IBVariables string fields and add to the `buildIBVariables()` return object.

- [ ] **Step 4: Inject new fields into prompts.ts Section 3e**

In `buildCaseIntelligence()`:
```typescript
${v.judge_demographics_summary ? `<judge_background>\n${v.judge_demographics_summary}\n</judge_background>` : ""}
${v.judge_sentencing_justfair ? `<judge_sentencing_patterns>\n${v.judge_sentencing_justfair}\n</judge_sentencing_patterns>` : ""}
${v.judge_racial_disparity ? `<judge_demographic_sentencing>\n${v.judge_racial_disparity}\n</judge_demographic_sentencing>` : ""}
```

- [ ] **Step 5: TypeScript check + commit Phase 2**

```bash
npx tsc,noEmit,skipLibCheck
git add src/lib/intelligence-brief/variables.ts src/lib/intelligence-brief/prompts.ts supabase/functions/generate-report/index.ts
git commit -m "feat(ib): wire JUSTFAIR + BJS data into Intelligence Brief variables and prompts"
```

---

## Phase 3: Officer Background Check Data Depth

**Impact:** $97 product goes from thin (32 CL rows) to comprehensive (NPI + Fatal Encounters).

**Note:** NPI V1 covers AZ, CA, GA only (3 states with processed data). Full 24-state needs Invisible Institute bulk data access. Fatal Encounters names agencies, not individual officers, cross-ref is agency-level.

### Task 3.1: Build + run NPI ingestion script

**Files:**
- Create: `scripts/ingest-npi.mjs`
- Input: `data/external-intel/npi/us-post-data/db/data/output/{az,ca,ga}/*-processed.csv.gz`
- Output: `officer_external_intel` table

Stream each state's processed CSV. Extract: officer name, agency, start date, end date, separation reason. Detect wandering officer pattern (terminated → hired elsewhere within 2 years). Upsert into `officer_external_intel` with `employment_history` jsonb, `npi_departments` integer, `is_wandering_officer` boolean.

Log to `data_source_freshness`: source_key='npi', last_ingested_at=NOW(), last_row_count=N.

### Task 3.2: Build + run Fatal Encounters ingestion script

**Files:**
- Create: `scripts/ingest-fatal-encounters.mjs`
- Input: `data/external-intel/fatal-encounters/fatal-encounters.csv` (25MB)
- Output: `officer_external_intel` enrichment (agency-level) or new `agency_incidents` table

Parse CSV. Group by agency + state. Store: incident count since 2013, incident dates, circumstances summary. Agency-level enrichment (not officer-level).

Log to `data_source_freshness`: source_key='fatal_encounters', last_ingested_at=NOW(), last_row_count=N.

### Task 3.3: Update Officer Background Check render

**Files:**
- Modify: `src/lib/tier9-reports/render.ts`, Add in `renderOfficerBackground()`:
  - Employment History Timeline section (chronological table from NPI data)
  - Wandering Officer Alert (highlighted box if terminated→rehired pattern detected)
  - Agency Fatal Encounter Alert (highlighted box if arresting agency has fatal encounters)

No query.ts changes needed, `queryOfficerBackground()` already queries `officer_external_intel`.

- [ ] **TypeScript check + commit Phase 3**

```bash
npx tsc,noEmit,skipLibCheck
git add scripts/ingest-npi.mjs scripts/ingest-fatal-encounters.mjs src/lib/tier9-reports/render.ts
git commit -m "feat(tier9): NPI + Fatal Encounters ingestion, Officer Background Check render upgrade"
```

---

## Phase 4: Case Decoder + Plea Analyzer + Score Enrichment

**Impact:** Every product touchpoint gets real sentencing data context.

### Task 4.1: Case Decoder sentencing context

**Files:**
- Modify: `supabase/functions/generate-report/index.ts`, In Case Decoder section, query sentencing_distributions for charge + state, inject as `<sentencing_context>` in CD prompt

### Task 4.2: Plea Analyzer JUSTFAIR grounding

**Files:**
- Modify: `src/app/api/plea-analyzer/route.ts`, Before calling Edge Function
- Modify: `supabase/functions/generate-standalone/index.ts`, Plea analyzer prompt case (NOT generate-report, this is a different Edge Function)

Query sentencing_distributions + outcome_benchmarks for charge + state. Pass as context string in Edge Function payload. Claude grounds its plea analysis in real district-level numbers.

### Task 4.3: Score page contextual enrichment

**Files:**
- Modify: `src/app/score/ScoreClient.tsx` or score API route, After score generation, query sentencing_distributions + outcome_benchmarks, render as data context below the score

- [ ] **TypeScript check + commit Phase 4**

---

## Phase 5: Free Tools (AFTER Phase 1 validation)

**Prerequisite:** Phase 1 complete and validated. JUSTFAIR name matching and data quality confirmed working before building public tools on the same queries.

### Task 5.1: Build Sentencing Calculator

**Files:**
- Modify: `src/lib/products.ts`, Register `sentencing-calculator` with `category: "calculator"` (uses existing `tools/[slug]` dynamic route)
- Create: New component for sentencing calculator (CalculatorClient.tsx loads by slug, the sentencing calculator needs its own component since it queries DB data unlike the existing rule-lookup calculators)
- Create: `src/app/api/tools/sentencing-calculator/route.ts`, API route querying JUSTFAIR

API queries `judge_sentencing_patterns` + `sentencing_distributions` by charge + state. If judge name provided, queries `judge_demographics`. Returns structured JSON.

Email capture gate: first query free, subsequent require email. Upsell CTA to Judge Report Card.

All JUSTFAIR-sourced results must label "Federal Courts" clearly.

### Task 5.2: Build Judge Comparison Tool

**Files:**
- Modify: `src/lib/products.ts`, Register `judge-comparison` with `category: "calculator"`
- Create: New comparison component
- Create: `src/app/api/tools/judge-comparison/route.ts`

Two judge names → parallel `queryJustfairJudge()` calls → side-by-side table. Email capture on second comparison. Upsell to Judge Report Card.

- [ ] **TypeScript check + commit Phase 5**

---

## Phase 6: New SKUs + Sample Page Updates

### Task 6.1: District Court Intelligence ($97)

**Files:**
- Modify: `src/lib/tiers.ts`, Add "district-court-intelligence"
- Create: `src/app/district-court-intelligence/page.tsx`, Landing page
- Add query + render functions following Tier 9 pattern
- Add coverage check + AvailabilityChecker

Queries: JUSTFAIR sentencing by district, BJS outcome benchmarks, aggregated judge_prosecutor_pairings. Includes "Prosecution Patterns" section (district-level, not named prosecutors).

### Task 6.2: Arrest Survival Kit ($47)

**Files:**
- Modify: `src/lib/tiers.ts`, Add "arrest-survival-kit"
- Create: `src/app/arrest-survival-kit/page.tsx`
- Query: officer_external_intel for agency-level data
- Render: rights checklist + agency context + upsell to Officer Background Check

### Task 6.3: Update sample report pages

**Files:**
- Modify: `src/app/sample/`, Sample report should show new JUSTFAIR sections
- Modify: `src/app/sample-xray/`, Same

These pages are trust signals, prospects see what they'll get. Must reflect the new data depth.

- [ ] **TypeScript check + commit Phase 6**

---

## Phase 7: Remaining Product Surfaces + Blog + Partner

**Impact:** Every customer-facing surface reflects the new data depth. No product left behind.

### Task 7.1: Similar Cases Analyzer + Officer Background Check landing page updates

**Files:**
- Modify: `src/app/similar-cases-analyzer/page.tsx`, Update "What You Get" to reflect richer sentencing_distributions (1,977+ rows) and outcome_benchmarks. "Powered by 595,851 federal sentencing records + BJS national outcome data."
- Modify: `src/app/officer-background-check/page.tsx`, After Phase 3 ingestion, add employment history, wandering officer detection, agency incident data to feature list.

### Task 7.2: Blog content sprint (6 data-driven posts)

Use existing blog pipeline. Aggregate statistics only, no individual names. Each post ends with product CTA.

1. "595,851 Federal Sentences Exposed: What Your Judge Is Really Doing" → Judge Report Card CTA
2. "The Plea Trap: Why 94% of Defendants Never See a Jury" → Plea Analyzer + Case Decoder CTA
3. "Bench Trial vs Jury Trial: Real Numbers from 8,383 Virginia Trials" → Intelligence Brief CTA
4. "Is Your Arresting Officer in This Database?" → Officer Background Check CTA
5. "The Sentencing Gap Nobody Talks About" → Judge Report Card CTA
6. "What 30,000 Police Encounters Tell Us About Your Rights" → Arrest Survival Kit CTA

### Task 7.3: Partner Portal trust signal

**Files:**
- Modify: `src/app/partners/page.tsx` (NOTE: `/partners/` with an "s", NOT `/partner/`), Add: "Our reports draw from 595,851 federal sentencing records, 15,386 judge profiles, 24 states of officer employment data, and 30,000+ police encounter records."

### Task 7.4: Update SCHEMA.md with new tables

**Files:**
- Modify: `supabase/SCHEMA.md`, Add `judge_demographics` and `judge_sentencing_demographics` table definitions (created by migration `20260414f_justfair_demographics.sql` but not yet documented)

### Task 7.5: Secondary pages data enrichment sweep

| Route | Action |
|-------|------, |
| `/sample/` | **MANDATORY**, Must show new JUSTFAIR sections (prospects see this before buying) |
| `/sample-xray/` | **MANDATORY**, Must reflect new data depth |
| `/dui-checklist`, `/dui-defense` | Add DUI federal sentencing range |
| `/research/[state]` | Add state-level JUSTFAIR data (federal districts in that state) |
| `/family/` | Sentencing context for family buyers |
| `/idd/` + `defense-score-data` | Ground defense score with JUSTFAIR |
| `/services/[slug]` | Update product descriptions with data depth |
| `/my-case/`, `/my-cases/` | Post-purchase: show sentencing context alongside report |
| `/operator/` | Add data freshness dashboard (query data_source_freshness) |
| `/guides/[slug]` | Reference aggregate JUSTFAIR stats where relevant |
| `/prep/` | Add sentencing ranges for defendant's charge |
| `/start/` | Data depth as trust signal |
| `/resources/` | Content hub, link to new free tools |
| `/playbooks/` | Product listing, add data depth trust signal |

Sample pages mandatory. Everything else: 15-min assessment → implement if value-add, skip if not.

### Products explicitly excluded from this plan

- **8 Playbooks ($127-$147):** No JUSTFAIR integration, static charge-type guides, not judge/officer specific. Deferred to v2 (dynamic playbooks with district sentencing data).
- **Extra Witness Intel ($149):** No action needed, witness-focused add-on, not judge/officer data.
- **Witness Pack ($297):** No action needed, witness-focused standalone, not judge/officer data.

### Pre-execution verification

Before starting Phase 1 Task 1.1 Step 1 (bench_jury state_code fix), verify that ALL existing bench_jury_divergence rows have `state_code` populated:

```sql
SELECT count(*) as total, count(state_code) as has_state_code FROM bench_jury_divergence;
```

If rows exist without `state_code`, the fix from ILIKE→eq will silently drop them from results. Backfill any NULL state_code rows before switching the query.

---

## Fix Traceability Matrix

| Fix ID | Description | Task |
|------, |-------------|------|
| C1 | sentencing_distributions has no district, use judge_sentencing_patterns | 1.1 (existing usscPatterns already queries it) |
| C2 | sources is text[], use .contains() | 1.1 (noted, existing query already returns JUSTFAIR rows) |
| C3 | Metrics contradiction, Prosecutor Report Card deferred | Spec updated, plan uses District Court Intelligence |
| I1 | Queries in defense-intelligence/query.ts | 1.1 (all JUSTFAIR queries in DI module) |
| I2 | Edge Function uses PostgREST fetch | 2.1 (uses existing supabaseSelect wrapper) |
| I3 | Wire existing IBVariables fields first | 2.1 Step 1 (first action in Phase 2) |
| I4 | Column is last_ingested_at | 3.1, 3.2 (freshness logging uses correct name) |
| I5 | Use tools/[slug] dynamic route | 5.1, 5.2 (register in product catalog) |
| S1 | Remaining routes sweep | 6.3 (sample pages) + deferred for other routes |
| S2 | Plea Analyzer uses generate-standalone | 4.2 (correct Edge Function) |
| S3 | renderJudgeReportCard accepts DefenseIntelligenceData | 1.2 (uses data.justfair pattern alongside existing param) |
| S4 | Phase 5 after Phase 1 validation | Phase 5 prereq note |
| BUG | bench_jury ILIKE → state_code | 1.1 Step 1 |
| BUG | render.ts duplicate const declarations | 1.2 Step 3 (hoisted as module-level helpers) |
| BUG | generate.ts wrong variable name | 1.2 Step 2 (uses `data.justfair`, verified) |
| NOTE | NPI = AZ/CA/GA only | Phase 3 header |
| NOTE | JUSTFAIR = federal only | 1.1 JSDoc, 1.3, 5.x labels |
| NOTE | Fatal Encounters = agency-level | 3.2 task description |
| NOTE | Edge Function buildIBVariables duplication | File Map warning + Phase 2 critical note |
| NOTE | PostgREST URL encoding | 2.1 Step 3 (encodeURIComponent on all values) |
