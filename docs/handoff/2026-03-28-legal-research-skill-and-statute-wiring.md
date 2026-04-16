# Handoff: Legal Research Skill + Statute Data Wiring
Date: 2026-03-28 20:30

## Task
Apply migration 011 (jurisdiction_profiles, judge_profiles), build the Level 1 legal research skill, load and verify FL statute data, and wire statute data into the report generation pipeline.

## What Was Accomplished

### Migration 011 Applied (to production Supabase)
- `jurisdiction_profiles` table created (one per case, court metadata, speedy trial, statute text)
- `judge_profiles` table created (cached, reusable across cases, CourtListener People API target)
- `case_monitoring` table created (docket alerts, RSS monitors)
- `verified_case_law` enhanced with citation_count, is_landmark, treatment_score, full_opinion_text
- `case_law_references` enhanced with research_source column

### Migration 030 Applied (to production Supabase)
- `jurisdiction_statutes` enhanced with: source_urls text[], verified_at timestamptz, confidence_score numeric, verification_notes text, statute_url text, statute_source text
- `statute_case_law` table created, links case law citations to specific jurisdiction_statutes

### Data Loaded: 510 Jurisdiction Statute Rows
- **FL**: 101 statutes (all verified)
- **GA**: 106 statutes
- **IL**: 102 statutes
- **NC**: 97 statutes
- **PA**: 104 statutes
- **3 failed**: federal (healthcare-fraud slug missing), MI + NJ (dui-second-offense slug missing), orphan slugs not in common_charges
- Script: `C:\Users\email\projects\ImNotAnAttorney-web\scripts\load-jurisdiction-data.mjs`

### FL Verification: 101/101 Statutes Verified
- Script: `C:\Users\email\projects\ImNotAnAttorney-web\scripts\legal-research-fl.mjs`
- Every FL statute verified against FL Online Sunshine (leg.state.fl.us)
- All at 0.50 confidence (MEDIUM = FL Online Sunshine confirmed + Justia URL)
- Each statute now has: source_urls (FL Online Sunshine + Justia), statute_url, verified_at, confidence_score

### Report Generator Wired (commit cafc9ab, deployed)
- `getChargeContext()` in `supabase/functions/generate-report/index.ts` now:
  1. Accepts optional `state` parameter
  2. Maps full state name ("Florida") to 2-letter code ("FL") via STATE_TO_CODE
  3. Queries `jurisdiction_statutes` for charge + jurisdiction match
  4. Injects statute number, title, elements, penalty ranges, mandatory minimums, enhancements, source URL into the CHARGE CONTEXT prompt block
- All 3 call sites updated (CD prompt builder, IB Phase A, IB Phase B)
- Backward compatible: falls back to charge-only context when no statute found

### Pipeline Architecture Updated
- Items 4-9: BROKEN → PARTIAL (statute data loaded, FL verified)
- Items 12, 16: BROKEN → DESIGNED (tables created, no producer yet)
- Broken data points: 18/31 → 12/31

## Files Modified

### Source files (committed cafc9ab)
- `supabase/functions/generate-report/index.ts`, STATE_TO_CODE mapping + jurisdiction_statutes query in getChargeContext()
- `docs/PIPELINE-ARCHITECTURE.md`, status updates for items 4-9, 12, 16

### New files (committed cafc9ab)
- `supabase/migrations/030-research-columns-and-case-law.sql`, research columns + statute_case_law table
- `scripts/load-jurisdiction-data.mjs`, loads jurisdiction JSON files into Supabase
- `scripts/legal-research-fl.mjs`, FL statute verification + CourtListener case law search

### Applied to DB (not in code)
- Migration 011 from `C:\Users\email\projects\ImNotAnAttorney\supabase\migrations\011-legal-source-maximization.sql`

## What Didn't Work
- federal.json, MI.json, NJ.json have orphan charge slugs not in common_charges. Minor, need to add missing slugs to COMMON_CHARGES array.
- No CourtListener API token yet, case law search ready but disabled.

## Remaining Steps

### P0: CourtListener API Token
Register at courtlistener.com for a free API token. Add to `.env.local` as `COURTLISTENER_TOKEN=xxx`. Then re-run:
```
cd C:\Users\email\projects\ImNotAnAttorney-web && node scripts/legal-research-fl.mjs
```
This will populate statute_case_law with 5-10 case law citations per FL statute.

### P1: Fix Orphan Slugs
Add `healthcare-fraud`, `dui-second-offense` to COMMON_CHARGES array in `scripts/generate-charge-taxonomy.ts`, run build-seed-migration, apply, then reload federal/MI/NJ.

### P2: Verify Other States
Run the research skill for GA, IL, NC, PA (need to adapt URL construction for each state's legislature site, or use Justia as primary source).

### P3: Level 2 Skill (Per Case)
- Jurisdiction profiles via CourtListener Courts API
- Judge profiles via CourtListener People API
- Wex definitions from Cornell LII
- Motion deadlines from state rules
- Wire into fetchLegalResearchData() consumer (already queries jurisdiction_profiles + judge_profiles)

### P4: Remaining Pipeline Items (12 still broken)
- Item 10: Expert→charge mapping (backfill experts.common_charge_slugs)
- Item 11: Pre-researched case law (needs CourtListener token)
- Items 13-15: Speedy trial, statute text, wex definitions (Level 2 skill)
- Items 17-18: Motion deadlines, arraignment dates (state rules + docket lookup)
- Items 19-24: Enrichment layer (diversion programs, collateral consequences, etc.)

## Verification
- `npx tsc,noEmit,skipLibCheck`, TypeScript clean
- FL verification: 101/101 statutes confirmed at 0.50 confidence
- `git push origin master`, deployed (commit cafc9ab)

## Copy-Paste Prompt for Next Session
```
Continue from C:\Users\email\projects\ImNotAnAttorney-web\docs\handoff\2026-03-28-legal-research-skill-and-statute-wiring.md

Legal research infra DONE (commit cafc9ab, deployed). 510 statute rows loaded (5 states), FL 101/101 verified, report generator wired to inject statute data.

Next priorities:
1. Register CourtListener API token at courtlistener.com, add COURTLISTENER_TOKEN to .env.local, re-run `node scripts/legal-research-fl.mjs` to populate case law
2. Fix orphan slugs (healthcare-fraud, dui-second-offense) to unblock federal/MI/NJ data load
3. Adapt legal-research-fl.mjs for other states (GA, IL, NC, PA) or build a generic version using Justia
4. Level 2 skill: per-case enrichment (judge profiles, wex definitions, motion deadlines)

Pipeline: 12/31 data points still broken (down from 18). See PIPELINE-ARCHITECTURE.md.
```
