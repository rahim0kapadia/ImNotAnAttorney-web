-- Drop orphaned tables: zero references in web/src or engine/src
-- Each table verified via grep across both ImNotAnAttorney-web and ImNotAnAttorney-engine
-- Using CASCADE to handle FK constraints between these tables
--
-- KEPT (referenced in src/lib/tier9-reports/query.ts):
--   case_feature_vectors, judge_prosecutor_pairings,
--   plea_discount_curves, sentencing_distributions
--
-- KEPT (DB function dependency):
--   engine_config (referenced by verify_worker_auth RPC)

-- From initial schema — never wired to application code
DROP TABLE IF EXISTS public.audit_runs CASCADE;         -- QA audit run tracking
DROP TABLE IF EXISTS public.audit_gaps CASCADE;          -- Tier 3 detector gaps (FK → audit_runs)
DROP TABLE IF EXISTS public.buyer_states CASCADE;        -- buyer state machine
DROP TABLE IF EXISTS public.co_defendant_analysis CASCADE; -- co-defendant analysis
DROP TABLE IF EXISTS public.content_assets CASCADE;      -- content management
DROP TABLE IF EXISTS public.cv_runs CASCADE;             -- continuous verification runs
DROP TABLE IF EXISTS public.emotional_profiles CASCADE;  -- emotional dimension profiles
DROP TABLE IF EXISTS public.eval_criteria CASCADE;       -- eval team criteria storage
DROP TABLE IF EXISTS public.intake_questions CASCADE;    -- intake flow questions
DROP TABLE IF EXISTS public.pipeline_eval_weights CASCADE; -- pipeline eval weights
DROP TABLE IF EXISTS public.portal_sessions CASCADE;     -- customer portal sessions

-- From later migrations — tier architecture tables never wired up
DROP TABLE IF EXISTS public.calculator_aggregates CASCADE; -- 20260406 standalone products
DROP TABLE IF EXISTS public.statute_case_law CASCADE;      -- 20250101000030 research columns
DROP TABLE IF EXISTS public.track_definition_library CASCADE; -- 20260407b tier1 strategy
DROP TABLE IF EXISTS public.detector_tuning CASCADE;       -- 20260408g tier3 detector engineering
DROP TABLE IF EXISTS public.quality_issues CASCADE;        -- 20260408g tier3 detector engineering
DROP TABLE IF EXISTS public.weapon_motion_links CASCADE;   -- 20260408d tier2 cross exam
DROP TABLE IF EXISTS public.weapon_evidence_links CASCADE; -- 20260408d tier2 cross exam
DROP TABLE IF EXISTS public.veri_claim_alignments CASCADE; -- 20260408i tier4 persona QA loop
