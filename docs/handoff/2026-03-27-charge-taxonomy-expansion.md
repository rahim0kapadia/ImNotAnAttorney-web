# Handoff: Charge Taxonomy Expansion
Date: 2026-03-27 21:15

## Task
Build a comprehensive US criminal charge taxonomy covering all 52 jurisdictions (50 states + DC + federal) with statute-level precision. Three-layer hierarchy: categories → common charges → jurisdiction-specific statutes. Crisis-optimized intake UX with progressive narrowing. Enriched charge context in every report at every tier.

## Approach
Three-Layer Hierarchy (Approach B) selected after brainstorming with expert triangulation:
- **Vitaly Friedman** (crisis UX): 10-30s micro-steps, progressive disclosure, max 8 options per screen
- **Dr. Vincent Covello** (crisis psychology): 80% cognitive reduction, Rule of 3, 4th-grade-level labels
- **Margaret Hagan** (Stanford Legal Design Lab): amplify legal capability, off-ramps at hard questions
- **Paul Robinson** (UPenn Law) + NCIC/SEARCH: NCIC codes as national backbone, 52 independent criminal codes

Data generated via Anthropic Batch API for all jurisdictions — no phasing. Statute data always included at every tier.

Rejected: Flat Statute Import (overwhelming UX), Search-First (poor for 2AM panic users).

## Files Created This Session
- `C:\Users\email\projects\ImNotAnAttorney-web\docs\specs\2026-03-27-charge-taxonomy-expansion.md` — full design spec (approved)
- `C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-03-27-charge-taxonomy-expansion.md` — 14-task implementation plan across 3 phases

## What Didn't Work
- Triage scope path got mangled on first attempt (backslashes eaten in JSON) — fixed with `path.resolve()` approach
- `docs/superpowers/specs/` is NOT in the hooks whitelist — used `docs/specs/` instead
- Research agent outputs were too large to read (74K+ tokens) — had to extract findings from the first agent's structured summary

## Remaining Steps
Execute the 14-task implementation plan:

### Phase 1: Database + Data Generation (Tasks 1-6)
1. Create charge taxonomy tables migration (028)
2. Build data generation script (Batch API prompts for 52 jurisdictions)
3. Generate taxonomy data for all 52 jurisdictions
4. Build seed migration from generated data (029)
5. Create charge taxonomy query library (`src/lib/charge-taxonomy.ts`)
6. Integrate enriched charge context into report generation

### Phase 2: Intake Form Rewrite (Tasks 7-10)
7. Build IntakeChargeCategories component (card grid)
8. Build IntakeChargeSelector component (with statute display)
9. Build IntakeChargeQuestions component (DB-driven)
10. Rewrite intake form with 3-screen progressive narrowing

### Phase 3: Homepage + Sales Pages (Tasks 11-13)
11. Update ChargeTypeSelector for 12 categories
12. Update HomepageHero for category-based selection
13. Update homepage catalog grid + schema knowsAbout

### Task 14: E2E verification

## Verification
- `cd C:\Users\email\projects\ImNotAnAttorney-web && npx next build` — production build
- `node ~/projects/continuous-verification/verify.mjs --project inna --probe-only --no-trends` — CV probes

## Copy-Paste Prompt for Next Session
```
Execute the implementation plan at
  C:\Users\email\projects\ImNotAnAttorney-web\docs\plans\2026-03-27-charge-taxonomy-expansion.md

Spec at:
  C:\Users\email\projects\ImNotAnAttorney-web\docs\specs\2026-03-27-charge-taxonomy-expansion.md

This is a LARGE_BUILD. 14 tasks, 3 phases. Start at Task 1.
Use subagent-driven-development for execution.
Tasks 1-6 are sequential (Phase 1: DB + data).
Tasks 7-9 can parallelize (Phase 2: 3 independent components).
Task 10 depends on 7-9.
Tasks 11-13 can parallelize (Phase 3: homepage updates).
```
