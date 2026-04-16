# Handoff: Tier 9 Case Feature Vector Enrichment

Date: 2026-04-13 01:30

## Task
Enrich 39,959 case_feature_vectors with outcome data, motion patterns, and holdings from CourtListener opinion text. The vectors currently have nationwide coverage (28 charge types × 51 jurisdictions) but shallow data, outcome, party_side, motion_types, and benefit_type are all null. The Similar Cases Analyzer product ($297) promises outcome distributions, motion patterns, and defense approaches, but the report will be thin without this enrichment.

## What Was Done This Session

### Tier 9 Frontend Integration (verified, all tasks from plan complete)
- Task 17 (tiers.ts): 3 SKUs live, Judge Report Card ($197), Officer Background Check ($97), Similar Cases Analyzer ($297)
- Task 15 (prompts.ts): 9 Tier 9 fields in IBVariables, injected into 5 section builders, buildTier9DataAppendix registered
- Task 16 (render.ts): tier9DataCount/tier9SourceUrlCount in header, Appendix F in sections
- Tasks 18-20: 3 landing pages with AvailabilityChecker, JSON-LD, FAQ accordion
- E2E: 32/32 all 3 products verified end-to-end

### Data Population (this session's main work)
- case_feature_vectors: 1,008 → 39,959 rows
- Fixed bulk-similar-case-matcher.mjs: removed wrong good-law filter, added dedup, fixed escJsonb double-escape bug
- Built pull-dui-all-states.mjs and pull-all-charges-all-states.mjs for targeted CourtListener API pulls
- Pulled 28 charge types across all 50 states + DC from CourtListener search API
- All pulls completed with 0 errors

### UI Expansion
- AvailabilityChecker dropdown: 17 flat options → 28 options in 7 `<optgroup>` categories (per accessibility-lead review)
- charge-types.ts: added 8 new charge types (murder, manslaughter, kidnapping, arson, stalking, child-abuse, hit-and-run, contempt) with legacy slug mappings

### Doc Updates
- DELIVERABLES-BY-TIER.md: added Tier 9 standalone products section + overview table rows
- Parent CLAUDE.md: added Tier 9 products to pricing table

## Files Modified
- `C:\Users\email\projects\ImNotAnAttorney-web\src\components\tier9\AvailabilityChecker.tsx`, CHARGE_TYPES → CHARGE_GROUPS with <optgroup>
- `C:\Users\email\projects\ImNotAnAttorney-web\src\lib\charge-types.ts`, 8 new charge types + legacy slug mappings
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\bulk-similar-case-matcher.mjs`, removed good-law filter, added dedup, fixed escJsonb
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\pull-dui-all-states.mjs`, NEW: targeted DUI pull from CourtListener
- `C:\Users\email\projects\ImNotAnAttorney-web\scripts\pull-all-charges-all-states.mjs`, NEW: all-charge pull from CourtListener (8 new charge queries added)
- `C:\Users\email\projects\ImNotAnAttorney\system\DELIVERABLES-BY-TIER.md`, added Tier 9 standalone section
- `C:\Users\email\projects\ImNotAnAttorney\CLAUDE.md`, added Tier 9 to pricing table

## What Didn't Work
- The `is_good_law` filter in bulk-similar-case-matcher reduced 6,718 unique cases to 715, killing coverage. Removed, factual similarity ≠ legal citation authority.
- escJsonb double-escaped backslashes (`\\` → `\\\\`) which corrupted JSON and caused 13/68 batch failures. Fixed to only escape single quotes.
- verified_case_law table is empty (renamed from statute_case_law but data never migrated). Matcher now reads from dump file directly. Pull scripts bypass the table entirely.

## The Core Problem (Next Session)
The 39,959 vectors have **coverage but not depth**. A typical vector:
```json
{
  "outcome": null,
  "party_side": null,
  "court_level": "appellate",
  "year_bucket": "2020s",
  "motion_types": [],
  "legal_issues": ["dui"],
  "benefit_type": null
}
```

The product promises outcome distributions, motion patterns, and defense approaches. The data has none of that. Supporting tables are also thin:
- sentencing_distributions: 133 rows total, 0 for FL DUI
- plea_discount_curves: 4 rows total
- outcome_benchmarks: 19 rows total

## Remaining Steps, Enrichment Pipeline

**CRITICAL LESSON LEARNED (2026-04-13):** The first enrichment attempt used 80K CourtListener API calls (~32 hours, constant rate-limit thrashing) for data already in local bulk CSVs. The bulk approach does the same work in ~20 minutes. **Always exhaust bulk data before touching the API.**

### Data source priority

1. `opinions-filtered.csv` (1.1GB, 8.3M rows, already decompressed), start here for opinion text
2. `opinion-clusters-2026-03-31.csv.bz2` (2.3GB), cluster metadata: posture, disposition, headmatter
3. `data/bulk-verify/external-intel/`, BJS/USSC sentencing, exoneration registry
4. CourtListener API, **fallback only**, for cases filed after March 31, 2026 that are not in the dump

### Steps

1. **Enrich vectors from bulk CSV**, `enrich-from-bulk.mjs` streams `opinions-filtered.csv` to extract outcome, party_side, and motion_types from opinion text. Uses `bulk-master-extractor.mjs` pattern: single streamer, `relax_quotes: true`, `relax_column_count: true`. Matches on `cluster_id` (strip surrounding quotes, CL CSVs quote all values). Target: fill nulls in the 39,959 vectors.

2. **Backfill sentencing_distributions from bulk**, Re-run `bulk-master-extractor.mjs,tables sentencing_distributions` against the opinions bulk CSV to expand from 133 rows. Then supplement with BJS/USSC datasets: `scripts/ingest-bjs-outcomes.mjs`, `scripts/download-external-datasets.mjs` (scripts exist, data already downloaded).

3. **Harvard CAP bulk download**, 6.7M historical cases (1658-2018). One-time download, local processing. Adds historical depth for deeper similar-case matching. Lower priority than steps 1-2.

4. **Re-run k-NN after enrichment**, Once vectors have real outcomes and motions, the similarity matching improves dramatically (Jaccard similarity on motion_types becomes meaningful).

5. **API gap-fill (last resort)**, Only after bulk enrichment is complete, identify vectors still missing outcome data. These are cases not in the March 31 dump (filed after that date). Pull those specific cluster_ids from the API, targeted, not a full sweep.

## Verification
- `cd C:\Users\email\projects\ImNotAnAttorney-web && npx next build`, should compile clean
- `node scripts/e2e-tier9.mjs`, all 3 products should pass (32/32 last run)
- `node scripts/check-tiers.mjs`, tier consistency check
- Count query: `node -e "..." // select count(*) from case_feature_vectors`, should be ~39,959

## Data Sources for Enrichment
- **CourtListener API** (cluster detail): `GET /api/rest/v4/clusters/{id}/`, returns opinion text, status, posture. Token: in .env.local as COURTLISTENER_TOKEN. Rate limit: ~5 req/sec authenticated.
- **CourtListener bulk CSV** (already downloaded): `data/bulk-verify/cl-bulk/opinions-2026-03-31.csv.bz2`, 50GB, full opinion text. Processed by bulk-master-extractor.
- **BJS/USSC datasets** (already downloaded): `data/bulk-verify/external-intel/`, federal sentencing, felony outcome stats. Ingestion scripts exist.
- **Harvard CAP** (not yet downloaded): case.law bulk download, 6.7M opinions, free.
