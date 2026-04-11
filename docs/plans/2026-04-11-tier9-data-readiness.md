# Tier 9 Data Readiness — Audit + Remediation Plan

**Date:** 2026-04-11
**Repo:** `C:\Users\email\projects\ImNotAnAttorney-web\`
**Problem:** Generation pipeline is deployed (3 commits), E2E passes, but all 3 SKUs return "insufficient data" because the Tier 9 tables have systemic data quality issues. The pipeline code also has column-name mismatches against the actual `judge_profiles` schema.

## Data Audit Results

### Table-by-Table Status

| Table | Rows | Status | Blocker |
|-------|------|--------|---------|
| `judge_profiles` | 15,613 | Schema mismatch | Column is `full_name`, not `name`. No `jurisdiction` column. No `court` column. Jurisdiction must be extracted from `positions` JSONB. Rollup columns (`sentencing_distributions`, `judicial_quotes`, `bench_acquittal_rate`, `jury_acquittal_rate`) are ALL NULL — never populated. |
| `judge_quotes` | 64,730 | Unlinked + generic | `judge_id` is NULL on all rows — quotes aren't linked to judges. Topic is "general" everywhere (not classified). Quotes are generic court opinion excerpts, not judge-specific attributable quotes. |
| `sentencing_distributions` | 244 | Unlinked | `judge_id` is NULL — not linked to specific judges. Has `charge_slug` data. Duplicate rows present. |
| `officer_reliability` | 11,818 | Garbage data | Top entries are "Attorney General" (282 testimonies), "Public Defender" (126), "Atty" (91) — not officers. Garbage names from parsing artifacts ("Colclasure attempted to do the same"). Jurisdiction is "multi" on ALL rows. Duplicates present. |
| `judge_prosecutor_pairings` | 205 | Sparse but decent | Only 1 judge_id populated. Small sample sizes (max 4). Data structure is correct. |
| `bench_jury_divergence` | 0 | Empty | Never populated. Script exists but hasn't run. |
| `appellate_trends` | 1,523 | No jurisdiction | Jurisdiction is "unknown" on all rows. Has argument types and rates. |
| `co_defendant_analysis` | 0 | Empty | Never populated. Script exists but hasn't run. |
| `plea_discount_curves` | 46 | Bad data | `base_sentence = plea_sentence = 600` everywhere — no actual discount computed. Looks like a default/cap value leaked through. |
| `case_feature_vectors` | 1,008 | All null slugs | `charge_slug` is NULL on all 1,008 rows. Has jurisdiction but no charge linkage. Feature vectors exist but unusable without charge_slug. |

### Code-to-Schema Mismatches (CRITICAL — pipeline won't work even with good data)

| File | Issue |
|------|-------|
| `query.ts:152` | `.ilike("name", ...)` — column doesn't exist. Should be `full_name`. |
| `query.ts:153` | `.eq("jurisdiction", intake.state)` — column doesn't exist on `judge_profiles`. Must derive from `positions` JSONB or add a denormalized column. |
| `query.ts:230` | `.eq("jurisdiction", intake.state)` on `officer_reliability` — jurisdiction is "multi" on all rows, never matches a state code. |

---

## Phase 0: Fix Query Code (blocks everything)

Fix the column-name mismatches so the pipeline works with whatever data exists.

### Task 0a: Fix judge_profiles query

**File:** `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\tier9-reports\query.ts`

Change `.ilike("name", ...)` → `.ilike("full_name", ...)`.

For jurisdiction: the `positions` JSONB contains `court_id` values (e.g., "wva" = West Virginia). Options:
1. **Add a denormalized `jurisdiction` column** to `judge_profiles` via migration, populated from `positions[0].court_id`. Then filter on it.
2. **Skip jurisdiction filter on judge lookup** — use name only (with ILIKE escaping already in place). If multiple judges match, return the one with the most data (join-count on sentencing_distributions).
3. **Parse `positions` in the query** — not possible with Supabase JS client's JSONB filtering.

**Recommendation:** Option 1 — add denormalized `jurisdiction` text column, populate via a one-time backfill script that maps `court_id` to state abbreviations using CourtListener's court ID format (first 2 chars are often the state, e.g., "txsd" = TX Southern District). Then the `.eq("jurisdiction", intake.state)` works.

### Task 0b: Fix officer_reliability jurisdiction

Currently all rows have `jurisdiction = "multi"`. The bulk extractor parsed cross-case officer mentions but didn't extract the jurisdiction from the source opinion's court. Fix: re-extract with jurisdiction from the opinion's court field, OR add a fallback that drops the jurisdiction filter if all matches are "multi".

**Quick fix for now:** If `.eq("jurisdiction", intake.state)` returns 0 rows, fall back to name-only search without jurisdiction filter. This unblocks the pipeline while data quality is fixed.

### Task 0c: Fix case_feature_vectors charge_slug

All 1,008 rows have `charge_slug = null`. The `bulk-similar-case-matcher.mjs` script needs to populate this field. Without it, `querySimilarCases` returns nothing.

---

## Phase 1: Data Quality Remediation

### Task 1a: Clean officer_reliability (garbage names)

Delete rows where `officer_name` matches non-officer patterns:
- "Attorney General", "Public Defender", "Atty", "District Attorney", "State Attorney"
- Names containing sentence fragments ("attempted to", "pursued it", "had already")
- Names shorter than 3 characters

**Script:** SQL cleanup + re-run `bulk-officer-reliability-aggregator.mjs` with stricter name filters.

### Task 1b: Link judge_quotes to judge_profiles

Currently `judge_id` is NULL on all 64,730 quotes. The `bulk-judge-quote-extractor.mjs` needs to:
1. Extract the authoring judge from the CourtListener opinion metadata (author field)
2. Match to `judge_profiles.cl_person_id`
3. Set `judge_id` on the quote row

Without this link, the Judge Report Card can't show quotes for a specific judge.

### Task 1c: Link sentencing_distributions to judges

Same issue — `judge_id` is NULL on all 244 rows. The `bulk-sentencing-outlier-detector.mjs` needs to extract the sentencing judge from the opinion and link to `judge_profiles`.

### Task 1d: Classify judge_quotes by topic

All quotes have `topic = "general"`. Need NLP classification into: sentencing, suppression, credibility, procedure, constitutional, evidence, etc. This makes the quote library section of the Judge Report Card useful — currently it's just random court opinion excerpts.

### Task 1e: Fix plea_discount_curves (base = plea = 600)

All 46 rows have `base_sentence = plea_sentence = 600` (months = 50 years). This looks like a cap value that leaked through. The `bulk-plea-discount-modeler.mjs` sentence parsing needs debugging — it's not differentiating plea vs trial sentences.

### Task 1f: Fix appellate_trends jurisdiction

All 1,523 rows have `jurisdiction = "unknown"`. The `bulk-appeal-outcome-correlator.mjs` needs to extract the court's state from the CourtListener opinion metadata.

### Task 1g: Populate bench_jury_divergence (0 rows)

Run `bulk-bench-jury-divergence.mjs`. The script exists but hasn't been executed.

### Task 1h: Populate co_defendant_analysis (0 rows)

Run `bulk-co-defendant-divergence-analyzer.mjs`. The script exists but hasn't been executed.

### Task 1i: Fix case_feature_vectors charge_slug

Re-run `bulk-similar-case-matcher.mjs` with charge classification from the `bulk-classify-cases.mjs` output. The matcher needs to set `charge_slug` based on the opinion's charge classification.

---

## Phase 2: Denormalization + Rollups

### Task 2a: Add jurisdiction column to judge_profiles

New migration adding `jurisdiction text` column. Backfill from `positions` JSONB using court_id → state mapping.

### Task 2b: Populate judge_profiles rollup columns

After Tasks 1b and 1c are done (quotes and sentencing linked to judges), run rollup aggregation:
- `sentencing_distributions` JSONB — aggregate from sentencing_distributions table
- `judicial_quotes` JSONB — aggregate from judge_quotes table
- `bench_acquittal_rate` / `jury_acquittal_rate` — from bench_jury_divergence table

These rollup columns exist on judge_profiles but are currently ALL NULL.

---

## Phase 3: E2E Verification with Real Data

### Task 3a: Re-run E2E with known-good data

After Phases 0-2, pick specific judges/officers that have data and run:
```
node scripts/e2e-tier9.mjs --only judge-report-card
node scripts/e2e-tier9.mjs --only officer-background-check
node scripts/e2e-tier9.mjs --only similar-cases-analyzer
```

Verify full report HTML renders with actual data sections populated.

### Task 3b: Visual report audit

Open a generated report in browser, verify:
- All sections render with data
- Source URLs are clickable
- Tables are readable
- UPL disclaimer present
- Brand styling intact after sanitizer

### Task 3c: Flip live: true

In `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\tiers.ts`, set `live: true` for all 3 SKUs after E2E + visual audit pass.

---

## Priority Order

| Priority | Task | Blocks | Effort |
|----------|------|--------|--------|
| P0 | 0a: Fix `full_name` column | All judge queries | 10 min |
| P0 | 0b: Fix officer jurisdiction fallback | Officer reports | 10 min |
| P0 | 0c: Fix case_feature_vectors charge_slug | Similar cases | Needs re-run of bulk script |
| P1 | 1a: Clean officer garbage names | Officer report quality | SQL cleanup |
| P1 | 1b: Link judge_quotes to judges | Judge Report Card quotes section | Script fix + re-run |
| P1 | 1c: Link sentencing_distributions to judges | Judge Report Card sentencing section | Script fix + re-run |
| P1 | 1f: Fix appellate_trends jurisdiction | All products' appellate section | Script fix + re-run |
| P2 | 1d: Classify quote topics | Quote library UX | NLP pass |
| P2 | 1e: Fix plea_discount_curves | Similar Cases plea section | Debug script |
| P2 | 1g: Populate bench_jury_divergence | Judge Report Card divergence section | Run existing script |
| P2 | 1h: Populate co_defendant_analysis | Situation Room only | Run existing script |
| P2 | 1i: Fix case_feature_vectors charge_slug | Similar Cases main section | Re-run with classification |
| P3 | 2a: Add jurisdiction to judge_profiles | Judge filtering accuracy | Migration + backfill |
| P3 | 2b: Populate rollup columns | Judge profile summary | Aggregation script |
| P4 | 3a-3c: E2E + visual + go-live | Launch | After P0-P2 done |

---

## Code Review: Query Code Issues

**Already fixed in previous commits:**
- ILIKE wildcard injection → `escapeIlike()` added
- Jurisdiction filter added to all queries
- Runtime intake validation added
- CSS sanitizer property whitelist added

**Still broken (this plan fixes):**
- `full_name` vs `name` column mismatch (Task 0a)
- `jurisdiction` doesn't exist on `judge_profiles` (Task 2a)
- Officer jurisdiction filter always fails because data is "multi" (Task 0b)

## Code Review: Extraction Script Issues

Based on audit data, the bulk extraction scripts have systemic issues:

1. **`bulk-officer-reliability-aggregator.mjs`** — No name validation filter. Extracts any capitalized word sequence as an "officer name", catching "Attorney General", "Public Defender", and sentence fragments.

2. **`bulk-judge-quote-extractor.mjs`** — Doesn't link quotes to specific judges. Extracts quotes from opinions but doesn't resolve the authoring judge to `judge_profiles.id`.

3. **`bulk-sentencing-outlier-detector.mjs`** — Doesn't link sentencing data to specific judges. Computes distributions per charge but not per judge.

4. **`bulk-plea-discount-modeler.mjs`** — Sentence parsing broken. All entries show `base_sentence = plea_sentence = 600` (cap value leak).

5. **`bulk-appeal-outcome-correlator.mjs`** — Doesn't extract court jurisdiction from opinion metadata. Sets jurisdiction to "unknown".

6. **`bulk-similar-case-matcher.mjs`** — Doesn't set `charge_slug` on feature vectors. The classification step is missing or disconnected.

7. **`bulk-master-extractor.mjs`** (76KB) — Orchestrator script. Likely delegates to the individual scripts above. The systemic issues suggest the common opinion-parsing layer doesn't extract judge identity, court jurisdiction, or charge classification reliably.
