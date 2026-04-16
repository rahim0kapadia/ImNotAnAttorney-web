# Dead Infrastructure Cleanup

**Status:** COMPLETE
**Scope:** 3 files (1 code edit + 2 new migrations)

## Context

Foundation audit identified dead infrastructure: an unexported function, orphaned DB RPCs, and orphaned DB tables. This plan cleans them up conservatively.

## Phase 1: Export feature flag function

**File:** `src/lib/feature-flags.ts`
- Add `export` keyword to `isFeatureEnabled()`, currently defined but unexported and uncallable
- No other changes needed; function signature and logic are correct

## Phase 2: Drop orphaned cron lock RPCs

**Migration:** `supabase/migrations/20260411b_drop_orphaned_cron_rpcs.sql`
- Drop `acquire_cron_lock(text, integer)` and `release_cron_lock(text)`
- Superseded by JS implementation in `src/lib/cron-idempotency.ts`
- Verified: zero references in `src/` and `ImNotAnAttorney-engine/src/`

## Phase 3: Drop orphaned tables

**Migration:** `supabase/migrations/20260411c_drop_orphaned_tables.sql`

### Grep verification results (both web/src and engine/src):

**KEEP (referenced in application code):**
- `case_feature_vectors`, `src/lib/tier9-reports/query.ts`
- `judge_prosecutor_pairings`, `src/lib/tier9-reports/query.ts`
- `plea_discount_curves`, `src/lib/tier9-reports/query.ts`
- `sentencing_distributions`, `src/lib/tier9-reports/query.ts`

**KEEP (DB function dependency, conservative):**
- `engine_config`, referenced by `verify_worker_auth` DB function

**DROP (19 tables, zero references in both repos):**
1. `audit_runs`, initial schema, QA audit run tracking, unreferenced
2. `audit_gaps`, Tier 3 detector engineering, unreferenced (depends on audit_runs)
3. `buyer_states`, initial schema, buyer state machine, unreferenced
4. `calculator_aggregates`, standalone products migration, unreferenced
5. `co_defendant_analysis`, initial schema, unreferenced
6. `content_assets`, initial schema, content management, unreferenced
7. `cv_runs`, initial schema, continuous verification, unreferenced
8. `detector_tuning`, Tier 3 detector engineering, unreferenced
9. `emotional_profiles`, initial schema, unreferenced
10. `eval_criteria`, initial schema, eval team criteria, unreferenced
11. `intake_questions`, initial schema, intake flow, unreferenced
12. `pipeline_eval_weights`, initial schema, pipeline eval weights, unreferenced
13. `portal_sessions`, initial schema, customer portal sessions, unreferenced
14. `quality_issues`, Tier 3 detector engineering, unreferenced
15. `statute_case_law`, research columns migration, unreferenced
16. `track_definition_library`, Tier 1 strategy architecture, unreferenced
17. `veri_claim_alignments`, Tier 4 persona QA loop, unreferenced
18. `weapon_evidence_links`, Tier 2 cross exam library, unreferenced
19. `weapon_motion_links`, Tier 2 cross exam library, unreferenced

All use `DROP TABLE IF EXISTS ... CASCADE` for FK safety.

## Verification

- `npx tsc,noEmit` after Phase 1
