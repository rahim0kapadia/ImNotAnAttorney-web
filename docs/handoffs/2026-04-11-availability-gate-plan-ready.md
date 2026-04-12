# Handoff: Data Availability Gate — Plan Ready for Execution

Date: 2026-04-11 15:30

## Task
Build a pre-purchase data availability gate for all 3 Tier 9 standalone products (Judge Report Card $197, Officer Background Check $97, Similar Cases Analyzer $297). Customers currently pay BEFORE entering who they want data about — if we don't have data, they get a refund email. This destroys trust. The gate moves intake to the landing page, checks data availability, and only shows the CTA when data exists.

## Approach
Approach A (landing page intake) chosen over checkout-page gating (Approach C) because telling someone "not available" during checkout is worse than telling them upfront. The check is positioned as the product starting to work — "We found 247 court opinions for Judge Martinez" — not as a gate.

Design spec: `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\specs\2026-04-11-data-availability-gate-design.md`
Implementation plan: `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\plans\2026-04-11-data-availability-gate.md`

Both committed and pushed.

## Files Modified This Session

### Tier 9 Go-Live (shipped)
- `src/lib/tiers.ts` — flipped all 3 SKUs to `live: true`
- `src/lib/tier9-reports/query.ts` — jurisdiction filter with fallback (agent)
- `scripts/bulk-similar-case-matcher.mjs` — charge_slug root cause fix (agent)
- `scripts/bulk-sentencing-outlier-detector.mjs` — rewrote loadJudges (pagination + URL fix + relax_quotes + try-catch)
- `scripts/bulk-judge-quote-extractor.mjs` — name→full_name fix
- `scripts/bulk-judge-prosecutor-pairing.mjs` — name→full_name fix
- `scripts/enrich-cl-aba-ratings.mjs` — full_name + cl_person_id (prior agent commit)
- `scripts/enrich-cl-retention-events.mjs` — full_name + cl_person_id (prior agent commit)
- `scripts/enrich-cl-citation-depth.mjs` — statute_case_law→verified_case_law (prior agent commit)
- `supabase/SCHEMA.md` — schema updates (agent)

### New Scripts
- `scripts/link-quotes-via-cl-api.mjs` — CL API quote linker (completed: 981 new links)
- `scripts/backfill-charge-slugs.mjs` — charge_slug backfill (completed: all 1,008 rows)
- `scripts/link-sentencing-to-judges.mjs` — sentencing linking (completed: 11 per-judge rows)
- `scripts/backfill-judge-jurisdiction.mjs` — judge jurisdiction backfill (agent)
- `scripts/run-tier9-pipeline.sh` — chained overnight pipeline runner

### New Docs
- `docs/superpowers/specs/2026-04-11-data-availability-gate-design.md`
- `docs/superpowers/plans/2026-04-11-data-availability-gate.md`
- `docs/handoffs/2026-04-11-tier9-live-and-data-enrichment.md`

## What Didn't Work
- CSV-based quote linking hit ceiling at 15,652 (filtered CSV too small) — solved with CL API linker
- Sentencing detector crashed 4 times: (1) `name` column bug, (2) URL parse off-by-one, (3) `relax_quotes` didn't prevent crash, (4) bzcat killed accidentally. Fixed with try-catch wrapper.
- ABA ratings enrichment: almost no matches because most judges are state-level, not federal
- Officer cleanup needed 3 passes (v1 role titles, v2 sentence fragments, v3 possessives/adverbs)

## Data State After This Session

| Table | Before | After |
|-------|--------|-------|
| judge_quotes (linked) | 15,652 | **25,228** (+61%) |
| sentencing_distributions | 244 (all NULL judge_id) | **133+** (11 linked, rest growing via pipeline) |
| officer_reliability | 11,818 (garbage) | **1,524** (clean) |
| case_feature_vectors (with charge_slug) | 0 | **1,008** (100%) |
| plea_discount_curves | 46 (74% bad) | **4** (clean) |

## Background Jobs
- **Tier 9 pipeline** running via `nohup bash scripts/run-tier9-pipeline.sh` (PID 195579). Chains 4 scripts against 50GB CSV. Monitor: `Read data/pipeline-output.log`. Will take 16-32 hours.
- After pipeline completes, run bench_jury_divergence: `NODE_OPTIONS="--max-old-space-size=8192" node scripts/bulk-bench-jury-divergence.mjs --apply`

## Remaining Steps
1. **Execute the availability gate plan** (9 tasks) at `C:\Users\email\projects\ImNotAnAttorney-web\docs\superpowers\plans\2026-04-11-data-availability-gate.md`
   - Use subagent-driven-development (recommended) or executing-plans skill
   - Task 4 (AvailabilityChecker component) touches UI — accessibility-lead review required
   - Task 6 (landing page modifications) touches UI — accessibility-lead review required
2. **Also found: broken checkout links** — all 3 landing pages link to `/checkout?tier=judge-report-card` which dead-ends. Fixed by the plan (Task 6 replaces CTAs with AvailabilityChecker that uses correct `/checkout?standaloneProduct=...` URL).
3. After pipeline finishes, verify new sentencing/pairings/divergence data populated.
4. Consider pulling Tier 9 SKUs back to `live: false` until the availability gate is deployed — currently a customer could pay and get thin data.

## Verification
- `npx tsc --noEmit` — TypeScript compiles clean
- `node scripts/check-tiers.mjs` — 18 tiers, all consistent
- `git log --oneline -10` — verify all commits present
- Pipeline monitor: read `data/pipeline-output.log` from the end

## Key Decisions
- All 3 SKUs flipped to LIVE before the availability gate exists — should consider reverting to `live: false` until gate ships
- `name` → `full_name` bug was systemic across 5+ scripts — all fixed
- Quote linking ceiling is 39% (61% are per curiam with no attributed author)
- Officer cleanup aggressive (11,818 → 1,524) — quality over quantity
- Level 1 email recognition (localStorage only, no accounts)
