# Handoff: Jurisdiction Statutes Expansion to All 50 States + DC + Federal
Date: 2026-04-05

## What Was Accomplished

### Phase 1: Fix + Load Blocked Data (DONE)
- **20 orphan slugs remapped** in MI/NJ/federal JSON files → canonical COMMON_CHARGES slugs
  (e.g., `assault-simple` → `simple-assault`, `possession-marijuana` → `drug-possession-marijuana`)
- **59 new charges added** to COMMON_CHARGES array in `generate-charge-taxonomy.ts`
  (DUI variants, CSC degrees, trafficking, cyber crimes, elder exploitation, weapons enhancements, federal offenses)
- **Total COMMON_CHARGES: 174** (was 115)
- **Migration 029 rebuilt** via `build-seed-migration.ts` and applied to Supabase
- **MI (107), NJ (95), federal (45) loaded** via `load-jurisdiction-data.mjs`
- **Total jurisdiction_statutes: 757 rows** across 8 jurisdictions

### Phase 2: Generate 44 Missing States + DC (BLOCKED)
- Script `generate-charge-taxonomy.ts` updated with skip-existing logic (won't regenerate existing JSONs)
- **All 44 state generations failed**: Anthropic API credits depleted
- Script confirmed working, just needs funded API key

### Phase 3: All-State Verification Script (BUILT + RUNNING)
- **New script: `scripts/legal-research-all.mjs`**
  - FL: FL Online Sunshine HTTP verification (0.40 → MEDIUM)
  - Federal: Cornell LII HTTP verification (0.50 → MEDIUM)
  - Other states: Justia URL as reference (0.15 → LOW), boosted by CourtListener case law
  - CourtListener: Case law search per statute, stored in `statute_case_law` table
- **Verification running** on all 757 statutes at time of handoff
- Early results:
  - Federal: 44/45 verified at MEDIUM (0.50). `federal-other` UNVERIFIED (catch-all, no statute).
  - FL: Confirming at MEDIUM (0.40) via FL Online Sunshine
  - GA/IL/MI/NC/NJ/PA: Expected LOW (0.15) from Justia, boosted to MEDIUM by CourtListener case law

### Phase 4: Audit (PENDING)
- Waiting for verification to complete

## Files Modified/Created

### Modified
- `scripts/generate-charge-taxonomy.ts`, 59 new COMMON_CHARGES entries + skip-existing in,all mode
- `data/charge-taxonomy/MI.json`, 19 slugs remapped, 1 duplicate dropped
- `data/charge-taxonomy/NJ.json`, 19 slugs remapped
- `supabase/migrations/029-seed-charge-taxonomy.sql`, rebuilt with 174 charges
- `scripts/CONTEXT.md`, documented new verification script
- `docs/plans/2026-04-05-jurisdiction-statutes-expansion.md`, execution plan

### Created
- `scripts/legal-research-all.mjs`, all-state verification + case law

### DB State
| Jurisdiction | Rows | Confidence |
|---|---|---|
| FL | 101 | 0.40-0.50 MEDIUM (verified) |
| GA | 106 | Verification in progress |
| IL | 102 | Verification in progress |
| MI | 107 | Verification in progress |
| NC | 97 | Verification in progress |
| NJ | 95 | Verification in progress |
| PA | 104 | Verification in progress |
| federal | 45 | 0.50 MEDIUM (44/45 verified) |
| **Total** | **757** | |

## Blocker: Anthropic API Credits
The ANTHROPIC_API_KEY in `.env.local` has zero balance. This blocks:
1. Generating 44 states + DC jurisdiction data (~$2-5 cost)
2. Generating charge questions for 134 uncovered charge slugs

Top up at: https://console.anthropic.com (Plans & Billing)

## What Didn't Work
- **Justia Cloudflare**: law.justia.com returns 403 (Cloudflare challenge) for programmatic HTTP requests. Cannot HTTP-verify state statutes via Justia. Workaround: use Justia URL as reference + CourtListener case law as verification signal.

## Remaining Steps

### Immediate (resume when API credits available)
```
cd C:\Users\email\projects\ImNotAnAttorney-web
npx tsx scripts/generate-charge-taxonomy.ts,all       # Generate 44 states + DC
node scripts/load-jurisdiction-data.mjs                 # Load all into DB
npx tsx scripts/generate-charge-taxonomy.ts,validate   # Validate output
node scripts/legal-research-all.mjs                     # Verify all new statutes
```

### After verification completes (this session or next)
```
node scripts/legal-research-all.mjs,summary           # Show confidence distribution
```

### Future improvements
- Per-state legislature website verification (FL Online Sunshine pattern for other states)
- Statute staleness tracking (quarterly refresh)
- `classify-case-law.mjs` run on newly stored case law

## Copy-Paste Prompt for Next Session
```
Continue from C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-04-05-jurisdiction-expansion.md

Phase 1 DONE: 174 common_charges, 757 jurisdiction_statutes across 8 jurisdictions.
Phase 2 BLOCKED: Anthropic API credits depleted. 44 states + DC need generation.
Phase 3: Verification script built at scripts/legal-research-all.mjs. Check if previous run completed.
Phase 4: Run final audit.

After API credits topped up:
  npx tsx scripts/generate-charge-taxonomy.ts,all
  node scripts/load-jurisdiction-data.mjs
  node scripts/legal-research-all.mjs
```
