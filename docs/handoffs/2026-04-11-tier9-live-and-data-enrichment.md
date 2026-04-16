# Handoff: Tier 9 SKUs LIVE + Data Enrichment Running

Date: 2026-04-11 13:30

## Task
Complete Tier 9 pipeline, fix data quality, flip all 3 SKUs to LIVE, start data enrichment.

## What Went Live

All 3 Tier 9 standalone SKUs set to `live: true` in `src/lib/tiers.ts`:

| SKU | Price | Status |
|---, |-------|------, |
| Judge Report Card | $197 | **LIVE** |
| Officer Background Check | $97 | **LIVE** |
| Similar Cases Analyzer | $297 | **LIVE** |

Commits pushed to master → Vercel auto-deploy.

## Data Fixes Applied

1. **case_feature_vectors charge_slug**, backfilled all 1,008 rows via `scripts/backfill-charge-slugs.mjs`. Was 100% NULL, now categorized (678 other, 44 theft, 40 weapons, 35 domestic-violence, 33 drug-possession, 31 fraud, 28 dui, etc.)

2. **sentencing_distributions judge linking**, replaced 244 garbage NULL-judge rows with 11 properly attributed per-judge rows via `scripts/link-sentencing-to-judges.mjs`. Root cause: `bulk-sentencing-outlier-detector.mjs` queried `name` column (doesn't exist) instead of `full_name`.

3. **officer_reliability cleanup**, 11,818 → 1,524 clean officers. Three cleanup passes:
   - v1: role titles, common verbs, length/numeric filters
   - v2: sentence fragments (took, gave, observed, etc.), possessives + nouns
   - v3: remaining possessive fragments, trailing adverbs

4. **name→full_name bug eradicated**, fixed in ALL 5 affected scripts:
   - bulk-sentencing-outlier-detector.mjs (also rewrote loadJudges with pagination)
   - bulk-judge-quote-extractor.mjs
   - bulk-judge-prosecutor-pairing.mjs
   - enrich-cl-aba-ratings.mjs (+ courtlistener_person_id→cl_person_id)
   - enrich-cl-retention-events.mjs (+ courtlistener_person_id→cl_person_id)
   - enrich-cl-citation-depth.mjs (+ statute_case_law→verified_case_law)

5. **query.ts jurisdiction filter**, judge lookup now filters by jurisdiction with name-only fallback

## Background Jobs Running

### 1. Quote Linking via CL API
- Script: `scripts/link-quotes-via-cl-api.mjs,apply`
- Status: 500/4,591 clusters processed, 79 matched, 421 per curiam (no author)
- ETA: ~30-40 minutes total
- Effect: Will increase linked quotes from 15,652 toward ~16,400 (16% match rate on remaining clusters)

### 2. Sentencing Detector Full Run
- Script: `NODE_OPTIONS=", max-old-space-size=8192" node scripts/bulk-sentencing-outlier-detector.mjs,apply`
- Status: Streaming 50GB bz2 through bzcat, loaded 14,941 judges
- ETA: 4-8 hours
- Effect: Will increase sentencing_distributions from 11 rows to potentially hundreds (full CSV has millions of opinions vs. 10K in filtered)

## Not Yet Running (queue after sentencing finishes)

### Bench/Jury Divergence
- Script: `NODE_OPTIONS=", max-old-space-size=8192" node scripts/bulk-bench-jury-divergence.mjs,apply`
- Prereqs: Same 50GB bz2, run AFTER sentencing detector finishes to avoid double disk I/O
- Effect: Populates bench_jury_divergence table (currently 0 rows)

## Current Data State

| Table | Rows | Quality |
|-------|------|---------|
| judge_profiles | 15,613 | Good |
| judge_quotes | 64,730 | 24%→~25% linked after CL API job |
| officer_reliability | 1,524 | Clean |
| appellate_trends | 1,523 | 66% have jurisdiction |
| sentencing_distributions | 11→? | Growing (full CSV running) |
| judge_prosecutor_pairings | 205 | Fully linked |
| case_feature_vectors | 1,008 | 100% have charge_slug |
| plea_discount_curves | 4 | Clean (bad data removed) |
| bench_jury_divergence | 0 | Waiting for script run |

## Verification

```bash
cd C:/Users/email/projects/ImNotAnAttorney-web
npx tsc,noEmit          # should compile clean
node scripts/check-tiers.mjs   # 18 tiers, all consistent
```

## Key Decisions

- Flipped all 3 SKUs simultaneously, render.ts handles empty sections with graceful "No data available" messages, so thin data doesn't break the product
- Officer cleanup aggressive (from 11,818 to 1,524), quality over quantity, garbage names in reports would damage trust
- Sentencing detector runs against full 50GB rather than re-using filtered CSV, filtered only yielded 11 rows
- Quote CL API linker bypasses CSV approach (which hit 15,652 ceiling) by directly querying cluster authors
