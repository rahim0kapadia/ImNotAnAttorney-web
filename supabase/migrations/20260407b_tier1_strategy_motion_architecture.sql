-- =============================================================================
-- Court Case -> INAA Port — Wave 1 — Tier 1: Strategy / Motion Architecture
-- =============================================================================
--
-- Spec: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-court-case-port\01-strategy-motion-architecture.md
-- Wave: 1 of 4 (Foundation + Net-New Positioning)
-- Order: SECOND — after 20260407a_tier5_judge_intelligence.sql
-- Reason: case_motion_opportunities.judge_id FK references judge_profiles(id)
--
-- This migration:
--   1. CREATEs 5 library tables (static seed, populated in follow-up migration):
--      strategic_motion_library, motion_argument_library, track_definition_library,
--      trap_architecture_library (with jurisdiction column), wave_calculation_rules
--   2. CREATEs 4 new per-case tables:
--      case_motion_arguments, case_finding_motion_links,
--      case_finding_argument_impacts, case_motion_opportunities
--      (case_motion_opportunities includes judge_id FK to judge_profiles)
--   3. Formalizes Management-API-only tables via CREATE TABLE IF NOT EXISTS:
--      case_motions, case_trap_tracks, case_wave_plan,
--      prosecution_counters, attorney_perspectives
--   4. ALTERs case_motions to add 28 new strategy columns
--   5. ALTERs case_trap_tracks and case_wave_plan to add DAG/strategy columns
--   6. ALTERs cases to add motion_consolidation_summary jsonb
--   7. RLS + moddatetime triggers + indexes
--
-- Feature flag gating: motion_wave_strategy (Phase 0 — currently OFF).
--
-- GAPS RESOLVED FROM PLAN:
--   - case_motion_opportunities.judge_id FK (plan referenced but did not declare)
--   - cases.motion_consolidation_summary ALTER (plan referenced but did not declare)
--
-- SEED DATA REVISION FROM SEED-DATA-SCRUB.md:
--   - strategic_motions (112 Court Case rows) is case-specific, NOT seed data.
--     case_motion_opportunities is the per-case target, populated by workers.
--   - track_definitions (18 Court Case rows) is case-specific, NOT seed data.
--     case_trap_tracks (extended below) is the per-case target.
--   - Library tables ship empty in this migration; populated by extraction script
--     in a follow-up migration.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1: LIBRARY TABLES (static seed, empty at migration time)
-- -----------------------------------------------------------------------------

-- 1.1 strategic_motion_library
CREATE TABLE IF NOT EXISTS public.strategic_motion_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motion_code text NOT NULL UNIQUE,
  motion_name text NOT NULL,
  motion_type text NOT NULL,
  default_track_id text,
  default_stage text NOT NULL DEFAULT 'S1',
  default_wave int,
  is_gateway boolean NOT NULL DEFAULT false,
  is_convergence_link boolean NOT NULL DEFAULT false,
  default_kill_shot text,
  default_depends_on jsonb DEFAULT '[]'::jsonb,
  charge_types jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smlib_type
  ON public.strategic_motion_library (motion_type);
CREATE INDEX IF NOT EXISTS idx_smlib_charge
  ON public.strategic_motion_library USING GIN (charge_types);

-- 1.2 motion_argument_library
CREATE TABLE IF NOT EXISTS public.motion_argument_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motion_type text NOT NULL,
  argument_code text NOT NULL,
  argument_name text NOT NULL,
  prosecution_claim text,
  defense_counter text,
  evidence_type text,
  defense_goal text NOT NULL DEFAULT 'attack',
  keywords jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT motion_argument_library_type_code_key
    UNIQUE (motion_type, argument_code)
);

CREATE INDEX IF NOT EXISTS idx_malib_type
  ON public.motion_argument_library (motion_type);

-- 1.3 track_definition_library
CREATE TABLE IF NOT EXISTS public.track_definition_library (
  track_id text PRIMARY KEY,
  track_name text NOT NULL,
  gateway_motion_code text,
  requires_track_ids jsonb DEFAULT '[]'::jsonb,
  s1_default_wave int,
  s2_default_wave int,
  s3_default_wave int,
  description text,
  theme text,
  kill_shot text,
  charge_types jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1.4 trap_architecture_library
CREATE TABLE IF NOT EXISTS public.trap_architecture_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motion_code text,
  motion_type text NOT NULL UNIQUE,
  track_id text,
  binding_rule text NOT NULL,
  state_must_prove jsonb DEFAULT '[]'::jsonb,
  denial_requires text,
  trap_statement text NOT NULL,
  appeal_argument text,
  magic_words jsonb DEFAULT '[]'::jsonb,
  forbidden_words jsonb DEFAULT '[]'::jsonb,
  one_liner_template text,
  cascade_effect text,
  three_way_impact_grant text,
  three_way_impact_deny text,
  three_way_impact_partial text,
  lock_in_language text,
  trial_objection_script text,
  jury_instruction_text text,
  forcing_mechanism_scripts jsonb DEFAULT '{}'::jsonb,
  charge_types jsonb DEFAULT '[]'::jsonb,
  jurisdiction text DEFAULT 'federal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_talib_motion_code
  ON public.trap_architecture_library (motion_code);
CREATE INDEX IF NOT EXISTS idx_talib_jurisdiction
  ON public.trap_architecture_library (jurisdiction);

-- 1.5 wave_calculation_rules
CREATE TABLE IF NOT EXISTS public.wave_calculation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL UNIQUE,
  rule_type text NOT NULL,
  parameter_json jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  description text,
  jurisdiction text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wave_calculation_rules_type_check
    CHECK (rule_type IN ('stage_gap', 'dependency', 'capacity', 'timing'))
);

-- -----------------------------------------------------------------------------
-- SECTION 2: FORMALIZE MANAGEMENT-API-ONLY TABLES
-- -----------------------------------------------------------------------------
-- These tables were created via the Supabase Management API. They exist in
-- production with zero rows. We formalize them here via CREATE TABLE IF NOT
-- EXISTS so future CI rebuilds work. In production this is a no-op; the
-- subsequent ALTER section adds the new columns.

-- 2.1 case_motions — base columns (pre-existing SP2 shape)
CREATE TABLE IF NOT EXISTS public.case_motions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  motion_code text NOT NULL,
  motion_name text NOT NULL,
  wave int,
  stage text,
  status text DEFAULT 'recommended',
  part_a_content text,
  part_b_content text,
  trap_track_id text,
  linked_findings jsonb DEFAULT '[]'::jsonb,
  case_law_ids jsonb DEFAULT '[]'::jsonb,
  prosecution_counters jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- 2.2 case_trap_tracks — base columns
CREATE TABLE IF NOT EXISTS public.case_trap_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  track_id text NOT NULL,
  track_name text NOT NULL,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 2.3 case_wave_plan — base columns
CREATE TABLE IF NOT EXISTS public.case_wave_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  wave int NOT NULL,
  stage text,
  motion_ids jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 2.4 prosecution_counters — formalized
CREATE TABLE IF NOT EXISTS public.prosecution_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  motion_id uuid,
  state_argument text,
  state_case_law jsonb DEFAULT '[]'::jsonb,
  strength_rating text,
  defense_counter text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- 2.5 attorney_perspectives — formalized
CREATE TABLE IF NOT EXISTS public.attorney_perspectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  attorney_name text,
  framework text,
  analysis text,
  key_insights jsonb DEFAULT '[]'::jsonb,
  recommended_actions jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- -----------------------------------------------------------------------------
-- SECTION 3: ALTER case_motions — 28 new strategy columns
-- -----------------------------------------------------------------------------
-- Idempotent. If columns exist (from a prior partial apply), these are no-ops.

ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS is_gateway boolean NOT NULL DEFAULT false;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS is_convergence_link boolean NOT NULL DEFAULT false;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS convergence_tracks jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS depends_on_motion_ids jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS kill_shot_score int NOT NULL DEFAULT 0;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS convergence_score int NOT NULL DEFAULT 0;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS dependency_position int NOT NULL DEFAULT 0;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS pre_trial_value int NOT NULL DEFAULT 0;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS trial_value int NOT NULL DEFAULT 0;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS appeal_value int NOT NULL DEFAULT 0;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS strategic_score int NOT NULL DEFAULT 0;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS consolidated_into uuid REFERENCES public.case_motions(id);
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS is_master boolean NOT NULL DEFAULT false;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS is_wave_locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS wave_locked_by text;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS wave_lock_reason text;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS wave_source text NOT NULL DEFAULT 'calculated';
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS absence_type text;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS absence_standard text;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS three_way_grant_text text;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS three_way_deny_text text;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS three_way_partial_text text;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS forcing_mechanism_scripts jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS cascade_effect text;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS lock_in_language text;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS one_liner text;
ALTER TABLE public.case_motions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_case_motions_case
  ON public.case_motions (case_id);
CREATE INDEX IF NOT EXISTS idx_case_motions_master
  ON public.case_motions (case_id)
  WHERE is_master = true;
CREATE INDEX IF NOT EXISTS idx_case_motions_score
  ON public.case_motions (strategic_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_case_motions_consolidated
  ON public.case_motions (consolidated_into)
  WHERE consolidated_into IS NOT NULL;

-- -----------------------------------------------------------------------------
-- SECTION 4: ALTER case_trap_tracks — DAG/strategy columns
-- -----------------------------------------------------------------------------

ALTER TABLE public.case_trap_tracks
  ADD COLUMN IF NOT EXISTS gateway_motion_id uuid REFERENCES public.case_motions(id);
ALTER TABLE public.case_trap_tracks
  ADD COLUMN IF NOT EXISTS requires_track_ids jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.case_trap_tracks
  ADD COLUMN IF NOT EXISTS s1_default_wave int;
ALTER TABLE public.case_trap_tracks
  ADD COLUMN IF NOT EXISTS s2_default_wave int;
ALTER TABLE public.case_trap_tracks
  ADD COLUMN IF NOT EXISTS s3_default_wave int;
ALTER TABLE public.case_trap_tracks
  ADD COLUMN IF NOT EXISTS theme text;
ALTER TABLE public.case_trap_tracks
  ADD COLUMN IF NOT EXISTS kill_shot text;
ALTER TABLE public.case_trap_tracks
  ADD COLUMN IF NOT EXISTS convergence_link boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ctt_case
  ON public.case_trap_tracks (case_id);

-- -----------------------------------------------------------------------------
-- SECTION 5: ALTER case_wave_plan — phase/convergence columns
-- -----------------------------------------------------------------------------

ALTER TABLE public.case_wave_plan
  ADD COLUMN IF NOT EXISTS phase_label text;
ALTER TABLE public.case_wave_plan
  ADD COLUMN IF NOT EXISTS theme text;
ALTER TABLE public.case_wave_plan
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.case_wave_plan
  ADD COLUMN IF NOT EXISTS lock_reason text;
ALTER TABLE public.case_wave_plan
  ADD COLUMN IF NOT EXISTS capacity_used int DEFAULT 0;
ALTER TABLE public.case_wave_plan
  ADD COLUMN IF NOT EXISTS convergence_targets jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.case_wave_plan
  ADD COLUMN IF NOT EXISTS decision_point_ids jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_cwp_case
  ON public.case_wave_plan (case_id);

-- -----------------------------------------------------------------------------
-- SECTION 6: ALTER cases — motion_consolidation_summary
-- -----------------------------------------------------------------------------
-- GAP RESOLVED: plan referenced this column in §5.3 but no ALTER block existed.

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS motion_consolidation_summary jsonb DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- SECTION 7: NEW PER-CASE TABLES
-- -----------------------------------------------------------------------------

-- 7.1 case_motion_arguments — junction: case × motion × argument
CREATE TABLE IF NOT EXISTS public.case_motion_arguments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  motion_id uuid NOT NULL REFERENCES public.case_motions(id) ON DELETE CASCADE,
  argument_library_id uuid NOT NULL REFERENCES public.motion_argument_library(id),
  is_active boolean NOT NULL DEFAULT true,
  curator_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_motion_arguments_unique
    UNIQUE (case_id, motion_id, argument_library_id)
);

CREATE INDEX IF NOT EXISTS idx_cma_case
  ON public.case_motion_arguments (case_id);
CREATE INDEX IF NOT EXISTS idx_cma_motion
  ON public.case_motion_arguments (motion_id);

-- 7.2 case_finding_motion_links — junction: finding × motion
CREATE TABLE IF NOT EXISTS public.case_finding_motion_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  finding_id uuid NOT NULL REFERENCES public.case_findings(id) ON DELETE CASCADE,
  motion_id uuid NOT NULL REFERENCES public.case_motions(id) ON DELETE CASCADE,
  contribution_type text NOT NULL DEFAULT 'supporting',
  use_in_motion text,
  source text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  CONSTRAINT case_finding_motion_links_unique
    UNIQUE (finding_id, motion_id),
  CONSTRAINT case_finding_motion_links_contribution_check
    CHECK (contribution_type IN ('primary', 'supporting', 'cross_exam_only'))
);

CREATE INDEX IF NOT EXISTS idx_cfml_case
  ON public.case_finding_motion_links (case_id);
CREATE INDEX IF NOT EXISTS idx_cfml_finding
  ON public.case_finding_motion_links (finding_id);
CREATE INDEX IF NOT EXISTS idx_cfml_motion
  ON public.case_finding_motion_links (motion_id);

-- 7.3 case_finding_argument_impacts — impact scoring
CREATE TABLE IF NOT EXISTS public.case_finding_argument_impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  finding_id uuid NOT NULL REFERENCES public.case_findings(id) ON DELETE CASCADE,
  argument_library_id uuid NOT NULL REFERENCES public.motion_argument_library(id),
  impact_direction text NOT NULL,
  impact_strength real NOT NULL DEFAULT 0.5,
  explanation text,
  conflicts_with_finding_id uuid REFERENCES public.case_findings(id),
  curator_override boolean NOT NULL DEFAULT false,
  curator_notes text,
  source text NOT NULL DEFAULT 'auto',
  confidence real NOT NULL DEFAULT 0.5,
  review_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  CONSTRAINT case_finding_argument_impacts_unique
    UNIQUE (finding_id, argument_library_id),
  CONSTRAINT case_finding_argument_impacts_direction_check
    CHECK (impact_direction IN ('supports', 'undermines', 'neutral')),
  CONSTRAINT case_finding_argument_impacts_review_check
    CHECK (review_status IN ('pending', 'approved', 'flagged', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_cfai_case
  ON public.case_finding_argument_impacts (case_id);
CREATE INDEX IF NOT EXISTS idx_cfai_conflict
  ON public.case_finding_argument_impacts (conflicts_with_finding_id)
  WHERE conflicts_with_finding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cfai_review
  ON public.case_finding_argument_impacts (review_status);

-- 7.4 case_motion_opportunities — strategic motion opportunities
-- GAP RESOLVED: judge_id FK to judge_profiles is included per plan §11 + Open Q #4.
-- Nullable — populated by motion-judge-scoring worker for War Room+ cases only.

CREATE TABLE IF NOT EXISTS public.case_motion_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES public.case_findings(id),
  motion_library_id uuid REFERENCES public.strategic_motion_library(id),
  judge_id uuid REFERENCES public.judge_profiles(id),
  motion_code text,
  motion_track text,
  severity text,
  description text,
  witness_name text,
  document_ref text,
  page_ref int,
  status text NOT NULL DEFAULT 'pending',
  wave int,
  stage text,
  is_wave_locked boolean NOT NULL DEFAULT false,
  wave_locked_by text,
  wave_lock_reason text,
  wave_source text NOT NULL DEFAULT 'calculated',
  verification_status text NOT NULL DEFAULT 'pending',
  verification_message text,
  absence_type text,
  absence_standard text,
  kill_shot_score int NOT NULL DEFAULT 0,
  convergence_score int NOT NULL DEFAULT 0,
  dependency_position int NOT NULL DEFAULT 0,
  pre_trial_value int NOT NULL DEFAULT 0,
  trial_value int NOT NULL DEFAULT 0,
  appeal_value int NOT NULL DEFAULT 0,
  strategic_score int NOT NULL DEFAULT 0,
  is_master boolean NOT NULL DEFAULT false,
  consolidated_into uuid REFERENCES public.case_motion_opportunities(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmo_case
  ON public.case_motion_opportunities (case_id);
CREATE INDEX IF NOT EXISTS idx_cmo_status
  ON public.case_motion_opportunities (status);
CREATE INDEX IF NOT EXISTS idx_cmo_score
  ON public.case_motion_opportunities (strategic_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_cmo_judge
  ON public.case_motion_opportunities (judge_id)
  WHERE judge_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- SECTION 8: RLS — all new + formalized tables
-- -----------------------------------------------------------------------------

ALTER TABLE public.strategic_motion_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motion_argument_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_definition_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trap_architecture_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wave_calculation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_motions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_trap_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_wave_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prosecution_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attorney_perspectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_motion_arguments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_finding_motion_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_finding_argument_impacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_motion_opportunities ENABLE ROW LEVEL SECURITY;

-- Service role full access + anon no access (DO block applies to 14 new/formalized tables)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'strategic_motion_library', 'motion_argument_library', 'track_definition_library',
    'trap_architecture_library', 'wave_calculation_rules',
    'case_motions', 'case_trap_tracks', 'case_wave_plan',
    'prosecution_counters', 'attorney_perspectives',
    'case_motion_arguments', 'case_finding_motion_links',
    'case_finding_argument_impacts', 'case_motion_opportunities'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "service_role_all_%I" ON public.%I',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "service_role_all_%I" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t, t
    );
    EXECUTE format(
      'DROP POLICY IF EXISTS "anon_no_access_%I" ON public.%I',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "anon_no_access_%I" ON public.%I FOR ALL TO anon USING (false)',
      t, t
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- SECTION 9: moddatetime triggers
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS update_strategic_motion_library_updated_at ON public.strategic_motion_library;
CREATE TRIGGER update_strategic_motion_library_updated_at
  BEFORE UPDATE ON public.strategic_motion_library
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_motion_argument_library_updated_at ON public.motion_argument_library;
CREATE TRIGGER update_motion_argument_library_updated_at
  BEFORE UPDATE ON public.motion_argument_library
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_track_definition_library_updated_at ON public.track_definition_library;
CREATE TRIGGER update_track_definition_library_updated_at
  BEFORE UPDATE ON public.track_definition_library
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_trap_architecture_library_updated_at ON public.trap_architecture_library;
CREATE TRIGGER update_trap_architecture_library_updated_at
  BEFORE UPDATE ON public.trap_architecture_library
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_case_motions_updated_at ON public.case_motions;
CREATE TRIGGER update_case_motions_updated_at
  BEFORE UPDATE ON public.case_motions
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_case_trap_tracks_updated_at ON public.case_trap_tracks;
CREATE TRIGGER update_case_trap_tracks_updated_at
  BEFORE UPDATE ON public.case_trap_tracks
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_case_wave_plan_updated_at ON public.case_wave_plan;
CREATE TRIGGER update_case_wave_plan_updated_at
  BEFORE UPDATE ON public.case_wave_plan
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_prosecution_counters_updated_at ON public.prosecution_counters;
CREATE TRIGGER update_prosecution_counters_updated_at
  BEFORE UPDATE ON public.prosecution_counters
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_attorney_perspectives_updated_at ON public.attorney_perspectives;
CREATE TRIGGER update_attorney_perspectives_updated_at
  BEFORE UPDATE ON public.attorney_perspectives
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_case_motion_opportunities_updated_at ON public.case_motion_opportunities;
CREATE TRIGGER update_case_motion_opportunities_updated_at
  BEFORE UPDATE ON public.case_motion_opportunities
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

-- =============================================================================
-- Verification queries (run manually post-apply):
--
-- -- Library row counts (expect all 0 — seed ships in follow-up migration):
-- SELECT 'strategic_motion_library' AS t, count(*) FROM strategic_motion_library
-- UNION ALL SELECT 'motion_argument_library', count(*) FROM motion_argument_library
-- UNION ALL SELECT 'track_definition_library', count(*) FROM track_definition_library
-- UNION ALL SELECT 'trap_architecture_library', count(*) FROM trap_architecture_library
-- UNION ALL SELECT 'wave_calculation_rules', count(*) FROM wave_calculation_rules;
--
-- -- New per-case tables exist (expect 4 rows):
-- SELECT table_name FROM information_schema.tables WHERE table_name IN
--   ('case_motion_arguments','case_finding_motion_links',
--    'case_finding_argument_impacts','case_motion_opportunities');
--
-- -- New columns on case_motions (expect 28 rows):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'case_motions' AND column_name IN (
--   'is_gateway','is_convergence_link','convergence_tracks','depends_on_motion_ids',
--   'kill_shot_score','convergence_score','dependency_position','pre_trial_value',
--   'trial_value','appeal_value','strategic_score','consolidated_into','is_master',
--   'is_wave_locked','wave_locked_by','wave_lock_reason','wave_source',
--   'verification_status','absence_type','absence_standard','three_way_grant_text',
--   'three_way_deny_text','three_way_partial_text','forcing_mechanism_scripts',
--   'cascade_effect','lock_in_language','one_liner','updated_at'
-- );
--
-- -- cases.motion_consolidation_summary exists:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'cases' AND column_name = 'motion_consolidation_summary';
--
-- -- case_motion_opportunities.judge_id FK exists:
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'case_motion_opportunities'::regclass
--   AND contype = 'f'
--   AND conname LIKE '%judge_id%';
--
-- =============================================================================
