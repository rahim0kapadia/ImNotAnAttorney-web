# Plan: Expand jurisdiction_statutes to 50 States + DC + Federal

**Date:** 2026-04-05
**Status:** Executing
**Triage:** LARGE_BUILD (4 phases, 10+ files, API generation + verification pipeline)

## Files Touched
- `scripts/remap-orphan-slugs.mjs`, one-time remap script (Phase 1, DONE)
- `scripts/generate-charge-taxonomy.ts`, add 59 new COMMON_CHARGES entries (Phase 1)
- `supabase/migrations/029-seed-charge-taxonomy.sql`, regenerated output (Phase 1)
- `data/charge-taxonomy/MI.json`, remapped slugs (Phase 1, DONE)
- `data/charge-taxonomy/NJ.json`, remapped slugs (Phase 1, DONE)
- `data/charge-taxonomy/{44 new state JSONs}`, generated output (Phase 2)
- `scripts/legal-research-all.mjs`, new generic verification script (Phase 3)

## Current State
- jurisdiction_statutes: 510 rows, 5 states (FL:101, GA:106, IL:102, NC:97, PA:104)
- FL: 101/101 verified at MEDIUM confidence
- GA/IL/NC/PA: loaded but unverified (confidence_score=NULL)
- MI/NJ/federal: JSON exists but blocked by 79 orphan slug FK violations
- 44 states + DC: no data at all

## Key Decision: Orphan Slug Strategy

79 orphan slugs in MI/NJ/federal JSONs. Two categories:

### 20 Remaps (rename in JSON to canonical COMMON_CHARGES slug)
| Orphan Slug | Canonical Slug |
|---|---|
| assault-simple | simple-assault |
| assault-deadly-weapon | assault-with-deadly-weapon |
| possession-marijuana | drug-possession-marijuana |
| possession-controlled-substance | drug-possession |
| possession-with-intent-distribute | drug-possession-with-intent |
| manslaughter-voluntary | voluntary-manslaughter |
| manslaughter-involuntary | involuntary-manslaughter |
| larceny | theft-larceny |
| violating-protective-order | violation-protective-order |
| firearm-felon-in-possession | felon-in-possession |
| carrying-concealed-weapon | concealed-carry-violation |
| fraud-identity-theft | identity-theft |
| fraud-credit-card | credit-card-fraud |
| fraud-insurance | insurance-fraud |
| fraud-mortgage | mortgage-fraud |
| eluding-police | fleeing-eluding |
| false-police-report | false-report |
| drunk-in-public | public-intoxication |
| driving-suspended-license | driving-on-suspended |
| dui-vehicular-homicide | vehicular-homicide |

### 59 Genuinely New Charges (add to COMMON_CHARGES)
New charges cover: DUI variants, CSC degrees (MI-specific), trafficking, cyber crimes,
elder exploitation, weapons enhancements, federal-specific offenses, etc.

## Phase 1: Fix + Load Blocked Data
1. Write remap script to update MI/NJ/federal JSON files
2. Add 59 new charges to COMMON_CHARGES in generate-charge-taxonomy.ts
3. Run build-seed-migration.ts to regenerate migration 029
4. Apply migration via Supabase Management API
5. Load MI/NJ/federal via load-jurisdiction-data.mjs

## Phase 2: Generate Missing States
6. Add skip-existing to generateAllJurisdictions
7. Generate 44 states + DC via,all (~$2-5 API cost)
8. Load all new JSONs
9. Validate via,validate

## Phase 3: Verify Everything
10. Build legal-research-all.mjs (generic verification)
    - States: Justia URL construction + HTTP verification
    - Federal: Cornell LII (law.cornell.edu/uscode/text/{title}/{section})
    - All: CourtListener case law search
11. Run on all 52 jurisdictions (including GA/IL/NC/PA which are unverified)
12. Report per-state verification summary

## Phase 4: Final Audit
13. Query: expect ~5,200+ rows across 52 jurisdictions (currently 757 across 8, generation blocked)
14. Every row: confidence_score >= 0.30
15. Flag failures for manual review or removal

## Blockers
- **Anthropic API credits depleted**: 44 states + DC cannot be generated until credits topped up
  - Command after top-up: `npx tsx scripts/generate-charge-taxonomy.ts,all`
  - Then load: `node scripts/load-jurisdiction-data.mjs`
  - Then verify: `node scripts/legal-research-all.mjs`
- **Justia Cloudflare**: States other than FL can't be HTTP-verified via Justia. CourtListener case law is the primary confidence booster for non-FL states.

## Progress
- Phase 1: DONE, 174 common_charges, 757 jurisdiction_statutes across 8 jurisdictions (FL, GA, IL, MI, NC, NJ, PA, federal)
- Phase 2: BLOCKED, API credits depleted, 0/44 states generated. Script works.
- Phase 3: RUNNING, verification in progress on 757 existing rows
- Phase 4: PENDING, waiting for Phase 3 completion
