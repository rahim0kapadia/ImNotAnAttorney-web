## Context

**The problem:** INAA premium tiers (X-Ray $2,497, War Room $4,997, Situation Room $9,997) sell "superpowered legal intelligence" but the actual data-driven edges that would make a defendant smarter than their own attorney don't exist yet. The MASTER-PLAN Court Case Port covers 9 of 13 defense-intel concepts. The engine (51 live workers) already implements 4 of those 9. Court Case (Rahim's personal defense system) pioneered judge/prosecutor/finding scoring. But **9 purely-statistical, no-AI-required "data architect's edge" angles don't exist anywhere**, and they're the biggest differentiator from what actual attorneys do.

**The three-repo reality discovered today:**
- **Court Case**, mature motion optimization machine. Has `judges`, `prosecutors`, `judge_rulings`, `motion_rulings`, `finding_argument_impacts`, `score_calibration` (feedback loops). Officer credibility schema exists but archived. Solved: judge dossier generation, ruling pattern analytics, trap track sequencing, outcome feedback loops. Missing: anything statistical across the 10M-opinion dataset.
- **Engine (51 workers)**, already has judge-research, prosecutor-research, case-law-validation (4-stage dead-precedent detection), legal-research with citation bundles, trap-track-assignment. Missing: anything that requires processing CL's full opinion corpus statistically.
- **Web (this repo)**, has the bulk data on disk (opinions CSV 50GB, citation-map 522MB, judges CSV 455KB, parentheticals 273MB, FJC 267MB, CAP cache 2,498 volumes). Just built: bulk-classify-from-opinions.mjs, bulk-good-law-by-cluster.mjs, bulk-add-reference-urls.mjs, bulk-populate-judge-profiles.mjs (426 judges), promote-to-engine-tier.mjs (500 case_law rows).

**The opportunity:** A new layer, call it **Tier 9: Data-Driven Defense Intelligence**, that does what lawyers can't do because they don't think statistically. Pure counting + distributions + graph analysis over the 10M-opinion corpus. Zero AI credits required. Produces things no attorney tool (Westlaw, Lexis, Casetext) offers at any price.

**The intended outcome:**
1. 9 new statistical intel features that move X-Ray → War Room → Situation Room pricing justified
2. A clean "engine → DB → web frontend" build path for each
3. Clear positioning: some as new SKUs, some as tier add-ons, some as baseline upgrades

## Gap Analysis, the 9 genuine missing angles

All 9 are purely statistical, computable from bulk data we already have on disk, no AI calls required.

| # | Angle | Why attorneys miss it | Computability |
|---|-------|----------------------|---------------|
| 1 | **Judge × Prosecutor pairing matrix** | Nobody tracks judge-prosecutor interactions | Join opinions author_id + party case metadata |
| 2 | **K-NN similar-case matching** | No vector search infrastructure in legal world | Feature vector per case + cosine similarity |
| 3 | **Sentencing outlier detection** | Requires median calculations across thousands of cases | Extract sentence length from opinion text, compute percentiles |
| 4 | **Bench vs jury divergence per judge** | Needs cross-referencing trial type with outcome | Opinion text contains "bench trial"/"jury trial" markers |
| 5 | **Judge quote library (verbatim)** | Tedious manual extraction | Mine author_id opinions for `"we held"`, `"we conclude"` quotes |
| 6 | **Officer reliability cross-case pattern** | Per-case mindset, not cross-case | Officer name extraction + grant rate correlation |
| 7 | **Appeal outcome correlation** | Attorneys don't track appellate trends | Citation-map filtered by reversal language |
| 8 | **Co-defendant divergence analysis** | Requires linking co-defendants in same case | Case caption parsing + outcome comparison |
| 9 | **Plea discount modeling** | No guideline/sentence distribution database | Statistical aggregation per charge + jurisdiction |

## Key files to read first (for the session that executes this)

- `C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-court-case-port\MASTER-PLAN.md`, the 8-tier port foundation
- `C:\Users\email\projects\ImNotAnAttorney-engine\src\workers\judge-research.mjs`, how existing judge intel works
- `C:\Users\email\projects\ImNotAnAttorney-engine\src\workers\case-law-validation.mjs`, dead precedent pattern to reuse
- `scripts/bulk-classify-from-opinions.mjs` (this repo), csv-parse + COALESCE pattern, the template for all new statistical workers
- `scripts/bulk-populate-judge-profiles.mjs` (this repo), template for using judges CSV
- `supabase/SCHEMA.md`, full column-level DB reference

## Where each angle fits from a client view (positioning)

### New baseline upgrades (all tiers get these, no new SKU)
These are "platform" improvements that make every existing tier better:
- **#5 Judge quote library**, used by ALL existing judge intel (Phase 4 enrichment)
- **#7 Appeal outcome correlation**, used by case-law-validation (already present)

### X-Ray ($2,497) adds
These become part of the X-Ray deliverable, no price change:
- **#3 Sentencing outlier flags**, "Judge Smith gives 30% higher sentences for DUI first offense. Consider plea."
- **#6 Officer reliability cross-case**, "Your arresting officer has been discredited in 6 of 47 cases in front of this judge."

### War Room ($4,997 → $5,997) justifies upgrade
The data-heavy tier:
- **#1 Judge × Prosecutor pairing matrix**, "When ADA X argues in front of Judge Y, grant rate is Z. Your ADA is currently A, so expect B."
- **#4 Bench vs jury divergence**, "Judge Martinez acquits at 38% bench, juries in her courtroom acquit at 11%. Waive the jury."
- **#2 K-NN similar-case matcher**, "Here are the 10 most factually-similar cases in front of this judge. 6 were dismissed, 2 pled, 2 convicted. Baseline dismissal probability: 60%."

### Situation Room ($9,997 → $12,997) adds
Elite-only features:
- **#8 Co-defendant divergence**, "Your co-defendant was acquitted. Here's what they did that you haven't yet."
- **#9 Plea discount modeling**, "This prosecutor's plea pattern for your charge: accept 40-60% off if they offer, reject if they offer only 20-30%. Expected cooperation value: X months off sentence."

### Standalone SKUs (new acquisition SKUs, parallel track)
- **Judge Report Card, $197**, strip of #1, #3, #4, #5, #6 for a specific judge. Low-commitment entry point. "Is your judge defense-friendly? Get the data."
- **Officer Background Check, $97**, #6 standalone. "Has your arresting officer been discredited before?"
- **Similar Cases Analyzer, $297**, #2 standalone. "See how defendants in cases like yours actually fared."

## Files to modify / create

### Phase A, engine workers (9 new `.mjs` files in engine/src/workers/)

1. `judge-prosecutor-pairing.mjs`, computes pairing matrix for judge-prosecutor combinations in our data
2. `similar-case-matcher.mjs`, builds feature vectors + stores k-NN neighbors per case
3. `sentencing-outlier-detector.mjs`, extracts sentences from opinion plain_text, computes percentiles per judge + jurisdiction
4. `bench-jury-divergence.mjs`, classifies opinions as bench vs jury, computes per-judge divergence
5. `judge-quote-extractor.mjs`, mines judge opinions for verbatim quotes by topic
6. `officer-reliability-aggregator.mjs`, cross-case officer pattern matching
7. `appeal-outcome-correlator.mjs`, citation-map analysis for appellate trends
8. `co-defendant-divergence-analyzer.mjs`, detects co-defendants in same case, compares outcomes
9. `plea-discount-modeler.mjs`, statistical plea distribution per charge + jurisdiction

### Phase B, Supabase schema (1 migration file)

`supabase/migrations/20260410_data_driven_defense_intel.sql` adds:

```sql
, New tables
CREATE TABLE judge_prosecutor_pairings (
  id uuid PRIMARY KEY, judge_id uuid, prosecutor_name text, motion_type text,
  grant_rate numeric, sample_size int, last_updated timestamptz
);
CREATE TABLE case_feature_vectors (
  cluster_id text PRIMARY KEY, features jsonb, jurisdiction text, charge_slug text
);
CREATE TABLE officer_reliability (
  id uuid PRIMARY KEY, officer_name text, court text, testimony_count int,
  discredited_count int, reliability_score numeric, brady_history jsonb
);
CREATE TABLE judge_quotes (
  id uuid PRIMARY KEY, judge_id uuid, quote text, topic text,
  case_cited text, source_url text
);
CREATE TABLE sentencing_distributions (
  id uuid PRIMARY KEY, judge_id uuid, jurisdiction text, charge_slug text,
  median_months numeric, p25 numeric, p75 numeric, sample_size int
);
CREATE TABLE bench_jury_divergence (
  id uuid PRIMARY KEY, judge_id uuid, charge_slug text,
  bench_acquittal_rate numeric, jury_acquittal_rate numeric
);
CREATE TABLE appellate_trends (
  id uuid PRIMARY KEY, argument_type text, jurisdiction text, year int,
  reverse_rate numeric, affirm_rate numeric
);
CREATE TABLE co_defendant_analysis (
  id uuid PRIMARY KEY, primary_case_id text, co_defendant_case_id text,
  outcome_diff text, divergence_factors jsonb
);
CREATE TABLE plea_discount_curves (
  id uuid PRIMARY KEY, jurisdiction text, charge_slug text,
  base_sentence numeric, plea_sentence numeric, cooperation_bonus numeric
);

, Extend existing judge_profiles
ALTER TABLE judge_profiles
  ADD COLUMN IF NOT EXISTS sentencing_distributions jsonb,
  ADD COLUMN IF NOT EXISTS judicial_quotes jsonb,
  ADD COLUMN IF NOT EXISTS bench_acquittal_rate numeric,
  ADD COLUMN IF NOT EXISTS jury_acquittal_rate numeric;
```

### Phase C, web frontend (new report sections + standalone pages)

- `src/lib/intelligence-brief/prompts.ts`, add 9 new prompt builders for the new data sections
- `src/lib/intelligence-brief/render.ts`, new render blocks for each angle
- `src/lib/tiers.ts`, add 3 new SKUs (Judge Report Card $197, Officer Background Check $97, Similar Cases Analyzer $297)
- `src/app/judge-report/[slug]/page.tsx`, standalone Judge Report Card page
- `src/app/officer-check/[name]/page.tsx`, standalone Officer Background Check page
- `src/app/similar-cases/page.tsx`, standalone Similar Cases Analyzer intake page
- Update X-Ray / War Room / Situation Room playbook templates to include the new sections

## Build order (dependency-aware)

**Wave 1, Foundation (immediately after current overnight runs finish)**
1. P1 of `bulk-extract-motion-legal-issues.mjs` (already written, waiting), needed by 5 of 9 workers downstream
2. Phase B migration, adds all 9 new tables + judge_profiles columns
3. Build + run `judge-quote-extractor.mjs` (worker #5), ONE opinions CSV stream, fills judge_quotes + judge_profiles.judicial_quotes. Touches no other new tables. Can ship independently.
4. Build + run `sentencing-outlier-detector.mjs` (worker #3), ONE opinions CSV stream, fills sentencing_distributions + judge_profiles.sentencing_distributions. Independent.

**Wave 2, Cross-case statistics (after Wave 1)**
5. Build + run `officer-reliability-aggregator.mjs` (worker #6), requires motion_types from Wave 1. Fills officer_reliability.
6. Build + run `judge-prosecutor-pairing.mjs` (worker #1), requires motion_types. Fills judge_prosecutor_pairings.
7. Build + run `bench-jury-divergence.mjs` (worker #4), fills bench_jury_divergence.

**Wave 3, Graph analysis (after Wave 2)**
8. Build + run `similar-case-matcher.mjs` (worker #2), fills case_feature_vectors. Requires all prior classifications to compute meaningful features.
9. Build + run `appeal-outcome-correlator.mjs` (worker #7), uses citation-map CSV. Fills appellate_trends.
10. Build + run `co-defendant-divergence-analyzer.mjs` (worker #8), fills co_defendant_analysis.

**Wave 4, Frontend integration**
11. Update `intelligence-brief/prompts.ts` + `render.ts` to use new tables
12. Update X-Ray / War Room / Situation Room templates
13. Build 3 standalone SKU pages (Judge Report Card, Officer Background Check, Similar Cases Analyzer)
14. Update `tiers.ts` with new SKUs and pricing

**Wave 5, Plea discount modeling (parallel or last)**
15. Build `plea-discount-modeler.mjs` (worker #9), requires sentencing distributions + statistical aggregation. Most complex. Saved for last.

## Tasks (numbered, executable order)

1. Write Phase B migration file `20260410_data_driven_defense_intel.sql` and apply via Supabase Management API
2. Build `scripts/bulk-judge-quote-extractor.mjs` (web repo, bulk pattern), mirror of bulk-classify-from-opinions.mjs
3. Run #2 after current overnight runs finish
4. Build `scripts/bulk-sentencing-outlier-detector.mjs`, mirror pattern
5. Run #4
6. Port working web bulk-* scripts to engine worker equivalents (`engine/src/workers/judge-quote-extractor.mjs` etc.)
7. Build `scripts/bulk-officer-reliability-aggregator.mjs`
8. Build `scripts/bulk-judge-prosecutor-pairing.mjs`
9. Build `scripts/bulk-bench-jury-divergence.mjs`
10. Run 7–9 sequentially
11. Build `scripts/bulk-similar-case-matcher.mjs` (k-NN with cosine similarity)
12. Build `scripts/bulk-appeal-outcome-correlator.mjs`
13. Build `scripts/bulk-co-defendant-divergence-analyzer.mjs`
14. Run 11–13 sequentially
15. Update `src/lib/intelligence-brief/prompts.ts` with 9 new section builders
16. Update `src/lib/intelligence-brief/render.ts` with 9 new render blocks
17. Add 3 new SKUs to `src/lib/tiers.ts` (Judge Report Card $197, Officer Background Check $97, Similar Cases Analyzer $297)
18. Build `src/app/judge-report/[slug]/page.tsx` (**delegate to accessibility-lead first per INAA-web rules**)
19. Build `src/app/officer-check/[name]/page.tsx` (**delegate to accessibility-lead first**)
20. Build `src/app/similar-cases/page.tsx` (**delegate to accessibility-lead first**)
21. Update X-Ray / War Room / Situation Room templates in `src/lib/playbook-configs.ts` or equivalent
22. Build `scripts/bulk-plea-discount-modeler.mjs` (most complex, last)
23. Run #22

### Architecture documentation updates (do these alongside Wave 1-4, not separately)

24. Update `ARCHITECTURE.md` (web repo), add the 9 new tables to the schema map, document the data-driven intel layer as a new architectural concern
25. Update `supabase/SCHEMA.md`, column-level documentation for all 9 new tables + new judge_profiles columns
26. Update `supabase/CONTEXT.md`, note the new tables in the case status state machine (none of them touch the state machine but they should be cataloged)
27. Update `docs/CONTEXT.md` (web repo), add the new data-driven intel layer + the 3 new standalone SKUs to the recent state section
28. Update `C:\Users\email\projects\ImNotAnAttorney-engine\ARCHITECTURE.md`, add the 9 new workers to the worker list, document Phase 7 (data-driven intelligence layer) if appropriate
29. Update `C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-court-case-port\MASTER-PLAN.md`, add Tier 9 (Data-Driven Defense Intelligence Layer) as a post-port wave, with the 9 new workers
30. Update `C:\Users\email\projects\ImNotAnAttorney-web\.claude\rules\product-tiers.md`, add the 3 new standalone SKUs (Judge Report Card $197, Officer Background Check $97, Similar Cases Analyzer $297) and the additive positioning ladder

**Architecture doc updates are not optional.** Per project rules, every schema/feature change must propagate to the architecture docs in the same wave it ships, not as a follow-up. Stale architecture docs cause future sessions to make wrong assumptions.

## Critical constraints (same as previous plan)

- **Do not interrupt the overnight runs** (bulk-good-law-by-cluster, bulk-classify-from-opinions)
- **No AI credits required** for any of these 9 workers, all are statistical / keyword matching
- **COALESCE additive pattern mandatory**, never overwrite
- **Source URLs stored for every change** per no-hallucinated-legal-data safety rule
- **Any UI work delegates to accessibility-lead first** per INAA-web CLAUDE.md

## Execution discipline (cost optimization)

This plan executes via haiku agents wherever possible. Total expected cost: **$10-20**, not $200+.

### Model assignments (override the default agent inheritance)

| Task type | Model | Why |
|---------, |-------|---, |
| Migration apply | haiku | Trivial SQL |
| Pattern-mirroring scripts (citation-map worker, co-defendant analyzer, plea modeler) | haiku | Existing patterns to copy |
| Architecture doc updates (tasks 24-30) | haiku | Pure writing |
| `tiers.ts` SKU additions | haiku | Tiny config edit |
| Frontend `prompts.ts` builders | sonnet | Needs TypeScript style match |
| Frontend `render.ts` blocks | sonnet | Same |
| Standalone SKU pages (UI) | sonnet + accessibility-lead first | UI rule mandate |
| **Master single-pass extractor** | **opus or direct** | Critical novel logic, signal extraction matters, can't afford bugs |
| Validation queries | haiku | Pure SQL |

**Rule of thumb:** if a working pattern exists in the repo to copy, haiku can do it. If novel logic or subtle judgment is needed, use sonnet or do it directly in opus.

### Cost discipline rules

1. **Spawn agents and /clear**, don't sit in opus chat babysitting. Each opus chat round carries the full context history; that's where real tokens get burned. Agents have isolated contexts.
2. **Fire-and-forget background agents**, use `run_in_background: true`. Check task notifications when they arrive; do not poll.
3. **Single brief opus session at the end**, read all agent reports in ONE session, verify, decide next moves. Don't ping back into opus mid-execution unless something fails.
4. **Haiku for execution, sonnet for adaptation, opus for novel**, three-tier model selection based on task complexity, not "always use opus."
5. **Re-run failed haiku tasks with sonnet**, if a haiku agent makes a wrong choice (we saw this earlier with the streamCsv swap), don't escalate the whole plan; just re-run that ONE task with a more capable model.

### Haiku failure modes to expect

Haiku has bitten us this session. Don't let it bite again:
- **Subtle pattern adaptation**, haiku sometimes picks the wrong existing pattern when multiple exist (e.g., `streamCsvSimple` vs `csv-parse` choice). For these, write the prompt with explicit "use exactly this pattern from THIS file" instructions.
- **Multi-step reasoning**, haiku rushes. For tasks with 5+ sequential decisions, prefer sonnet.
- **Schema discovery**, haiku might assume column names instead of querying information_schema. Always tell haiku agents to "check the schema first via information_schema.columns" before writing INSERT statements.

### Total cost ceiling

If actual costs exceed $30 across the entire plan, stop and re-evaluate. The whole point of the haiku-first approach is to keep this work nearly free while still shipping fast.

## Verification

For each worker:
1. Dry-run with `, limit 10` to confirm data shape
2. Full run to populate table
3. Query target table: COUNT(*) + spot-check 5 rows
4. End-to-end query: run the attorney question that worker enables (e.g., "which judges have suppression grant rate > 20%?") and verify result sanity

Final integration check: place a test X-Ray order, verify new sections appear in the generated report, verify the numbers match direct DB queries.

## What this unlocks

### Public positioning, additive, NOT replacement

The existing brand foundation stays exactly where it is:

> **"Know What They Know."**
> The defendant is the only stranger in the courtroom. Everyone else, judge, prosecutor, defense attorney, knows each other, works together every week. We close that information gap.

That tagline is the L0/L1 positioning across ALL tiers. It does not change. The new data-driven layer is an **escalator on top** of the existing promise, a reason to upgrade from Case Decoder ($97) → Intelligence Brief ($997) → X-Ray ($2,497) → War Room ($4,997) → Situation Room ($9,997).

**The positioning ladder (additive):**

| Tier | Layer | Promise extension |
|------|-------|-------------------|
| Case Decoder ($97) | Know what they know | Legal information about your charges + 10-15 questions |
| Intelligence Brief ($997) | Know what they know, **about your jurisdiction** | + jurisdiction-specific intel + 15-25 questions |
| X-Ray ($2,497) | Know what they know, **about your judge and your case** | + judge intel + sentencing patterns + officer history + 35-50 questions + Discovery Strength Rating |
| War Room ($4,997) | Know what they know, **and the patterns no one else sees** | + judge×prosecutor pairing + similar-case math + bench/jury divergence + ongoing weekly intelligence |
| Situation Room ($9,997) | Know what they know, **including the math no attorney has computed** | + co-defendant divergence + plea discount modeling + full-team coordination |

**Each tier adds; nothing replaces.** The L0 promise (close the information gap) is constant. Premium tiers expand WHAT KIND of information is in the gap.

### Internal/strategic framing (this stays internal, never customer-facing)

For us internally to remember why this work matters:

> Westlaw ($500/mo), Lexis ($300/mo), Casetext ($99/mo) are tools FOR ATTORNEYS. They give the priesthood more priesthood. We're the first product that does data-driven defense intel FOR DEFENDANTS, at a price they can afford, using public data nobody else has the infrastructure to process.

That framing helps US prioritize features and write good copy, but it's not the customer message. The customer message stays "Know what they know." Always.

### UPL safety for the new sections

All 9 new data sections must present **information**, not **advice**. The line:

- ✅ SAFE, information: "Judge Smith granted 8% of suppression motions in DUI cases since 2020. Cases that were granted shared these factors: [list]. Your case has 2 of those 5 factors."
- ❌ UNSAFE, advice: "You should not file a motion to suppress because Judge Smith will deny it."

Every render block in `intelligence-brief/render.ts` must end with a question, not a recommendation. "Ask your attorney whether..." not "Do/don't do X." This is the same rule the existing tiers already follow, the new data layers inherit it.

### Defensible moat (internal)

The engine already handles 60% of what premium tiers promise. This plan fills the other 40% with statistical intelligence that doesn't exist in any defendant-facing product at any price. The 13M+ rows of CL bulk data on disk + the COALESCE additive verification pattern + the 51-worker engine = an infrastructure moat that takes years and significant capital to replicate.

That moat is what makes the existing "Know What They Know" promise defensible at premium price points. Without the new layer, X-Ray feels like a more expensive Intelligence Brief. With it, X-Ray feels like a different product class entirely.
