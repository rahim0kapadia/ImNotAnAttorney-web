-- =============================================================================
-- Court Case -> INAA Port — Wave 2 — Tier 2: Cross-Exam / Trial Prep Library
-- =============================================================================
--
-- Spec: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-court-case-port\02-cross-exam-library.md
-- Wave: 2 of 4 (Content Layer — Cross-Exam + Trial Prep)
-- Order: FOURTH — after Wave 1 Tier 5, Tier 1, Tier 8A migrations
--
-- This migration:
--   1. CREATEs 7 library tables (immutable seed, no case_id):
--        attack_patterns_library, legal_weapons_library, voir_dire_library,
--        weapon_finding_links, weapon_motion_links, weapon_witness_links,
--        weapon_evidence_links
--   2. CREATEs/ALTERs finding_attack_patterns (already exists via Management API)
--   3. CREATEs 5 per-case tables:
--        case_trial_themes, case_trial_narrative, case_one_phrase_candidates,
--        case_voir_dire_questions, cross_witness_patterns
--   4. Enables RLS on all new tables with service_role_full_access + anon_no_access
--   5. Installs moddatetime triggers for updated_at maintenance
--   6. Creates indexes for query hot paths
--
-- Feature flag gating: cross_exam_templates (Phase 0 — currently OFF).
-- Workers and Edge Function consume new tables ONLY when flag is enabled.
--
-- SEED DATA: NOT included in this migration. Seed rows for attack_patterns_library
-- (100 rows), legal_weapons_library (62 rows), weapon_*_links (375 rows), and
-- voir_dire_library (10 deduped rows) are extracted from Court Case discovery.db
-- via a follow-up extraction script and appended in a subsequent migration.
-- Schema ships empty; workers handle empty tables gracefully via JSON file fallback
-- until seed lands.
--
-- CASCADE SAFETY: Library tables have NO FK references to core tables (cases,
-- orders, intakes). Per-case tables FK to cases(id) ON DELETE CASCADE in the
-- correct direction (child -> parent). Dropping library tables during rollback
-- cannot cascade into case data.
--
-- Source: Court Case discovery.db v5.10
-- =============================================================================


-- =============================================================================
-- SECTION A: Library Tables (immutable seed, no case_id)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A1. attack_patterns_library — 100 finding-type-keyed cross-exam templates
-- -----------------------------------------------------------------------------
-- Source: Court Case attack_patterns (100 rows)
-- Dropped columns: auto_generated, synthesis_source_id, effectiveness_rating
--   (workflow noise, not library data)
-- Translated: TEXT JSON columns -> jsonb, TEXT timestamps -> timestamptz
-- Preserved: strength_rating (STRONG/MEDIUM) for cross-exam prioritization

CREATE TABLE IF NOT EXISTS public.attack_patterns_library (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  finding_type text UNIQUE NOT NULL,
  category text,
  question_template text,
  kill_shot_template text,
  voir_dire_template text,
  spin_response text,
  closing_callback text,
  meta_frame text,
  phase1_questions jsonb DEFAULT '[]'::jsonb,
  phase2_questions jsonb DEFAULT '[]'::jsonb,
  phase3_questions jsonb DEFAULT '[]'::jsonb,
  escape_routes jsonb DEFAULT '{}'::jsonb,
  severity_weight integer DEFAULT 1,
  strength_rating text,
  charge_types jsonb DEFAULT '["all"]'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_apl_finding_type
  ON public.attack_patterns_library (finding_type);
CREATE INDEX IF NOT EXISTS idx_apl_category
  ON public.attack_patterns_library (category);
CREATE INDEX IF NOT EXISTS idx_apl_strength
  ON public.attack_patterns_library (strength_rating)
  WHERE strength_rating IS NOT NULL;

ALTER TABLE public.attack_patterns_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_attack_patterns_library"
  ON public.attack_patterns_library
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_attack_patterns_library"
  ON public.attack_patterns_library
  FOR ALL
  TO anon
  USING (false);

CREATE TRIGGER update_attack_patterns_library_updated_at
  BEFORE UPDATE ON public.attack_patterns_library
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');


-- -----------------------------------------------------------------------------
-- A2. legal_weapons_library — 62 legal weapons across 9 tiers
-- -----------------------------------------------------------------------------
-- Source: Court Case legal_weapons (62 rows)
-- Preserved: text PK weapon_id (e.g. "0.1", "2.8", "8.3") — zero key remapping
-- Fixes applied at seed time (not in schema):
--   8.3: name "EMERGENCY ESCAPE ROUTES (FLORIDA)" -> "EMERGENCY ESCAPE ROUTES"
--   2.8: key_case Pinellas citation -> parameterized
--   2.9: name "RULE 3.190(c)(4) PRIMA FACIE FRAMEWORK" -> parameterized
-- Added: jurisdiction column for state-specific weapons

CREATE TABLE IF NOT EXISTS public.legal_weapons_library (
  weapon_id text PRIMARY KEY,
  tier text,
  name text NOT NULL,
  power_level text NOT NULL,
  phase text,
  description text,
  effect text,
  argument_language text,
  key_case text,
  source_url text,
  jurisdiction text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT legal_weapons_power_level_check
    CHECK (power_level IN ('DISPOSITIVE', 'HIGH', 'STANDARD'))
);

CREATE INDEX IF NOT EXISTS idx_lwl_power_level
  ON public.legal_weapons_library (power_level);
CREATE INDEX IF NOT EXISTS idx_lwl_tier
  ON public.legal_weapons_library (tier);
CREATE INDEX IF NOT EXISTS idx_lwl_phase
  ON public.legal_weapons_library (phase)
  WHERE phase IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lwl_jurisdiction
  ON public.legal_weapons_library (jurisdiction)
  WHERE jurisdiction IS NOT NULL;

ALTER TABLE public.legal_weapons_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_legal_weapons_library"
  ON public.legal_weapons_library
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_legal_weapons_library"
  ON public.legal_weapons_library
  FOR ALL
  TO anon
  USING (false);

CREATE TRIGGER update_legal_weapons_library_updated_at
  BEFORE UPDATE ON public.legal_weapons_library
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');


-- -----------------------------------------------------------------------------
-- A3. voir_dire_library — Static voir dire questions, Roy Black classified
-- -----------------------------------------------------------------------------
-- Source: Court Case voir_dire_questions (64 rows, deduped to 10 unique questions)
-- Filtering: linked_theme_id IS NOT NULL rows excluded (case-specific)
-- Dedup: 56 library-eligible rows collapse to 10 distinct question_texts
-- Category rename: case_specific -> tactical (per dry-run-log scrub directive)
-- Synthetic question_id assigned at seed time (serial)

CREATE TABLE IF NOT EXISTS public.voir_dire_library (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category text NOT NULL,
  question_text text NOT NULL UNIQUE,
  purpose text,
  ideal_response text,
  disqualifying_response text,
  phase text,
  roy_black_seduction_level text,
  use_priority integer DEFAULT 5,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT voir_dire_rb_level_check
    CHECK (roy_black_seduction_level IN ('education', 'commitment', 'inoculation')),
  CONSTRAINT voir_dire_phase_check
    CHECK (phase IN ('individual', 'panel', 'follow_up'))
);

CREATE INDEX IF NOT EXISTS idx_vdl_category
  ON public.voir_dire_library (category);
CREATE INDEX IF NOT EXISTS idx_vdl_priority
  ON public.voir_dire_library (use_priority);
CREATE INDEX IF NOT EXISTS idx_vdl_rb_level
  ON public.voir_dire_library (roy_black_seduction_level);

ALTER TABLE public.voir_dire_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_voir_dire_library"
  ON public.voir_dire_library
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_voir_dire_library"
  ON public.voir_dire_library
  FOR ALL
  TO anon
  USING (false);

CREATE TRIGGER update_voir_dire_library_updated_at
  BEFORE UPDATE ON public.voir_dire_library
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');


-- -----------------------------------------------------------------------------
-- A4. weapon_finding_links — (weapon_id, finding_type) joins
-- -----------------------------------------------------------------------------
-- Source: Court Case weapon_finding_links (240 rows)
-- Library-to-library join: legal_weapons_library <-> attack_patterns_library
-- No case_id. Not case-scoped.

CREATE TABLE IF NOT EXISTS public.weapon_finding_links (
  weapon_id text NOT NULL,
  finding_type text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (weapon_id, finding_type),
  CONSTRAINT wfl_weapon_id_fk
    FOREIGN KEY (weapon_id) REFERENCES public.legal_weapons_library(weapon_id),
  CONSTRAINT wfl_finding_type_fk
    FOREIGN KEY (finding_type) REFERENCES public.attack_patterns_library(finding_type)
);

CREATE INDEX IF NOT EXISTS idx_wfl_finding_type
  ON public.weapon_finding_links (finding_type);

ALTER TABLE public.weapon_finding_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_weapon_finding_links"
  ON public.weapon_finding_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_weapon_finding_links"
  ON public.weapon_finding_links
  FOR ALL
  TO anon
  USING (false);


-- -----------------------------------------------------------------------------
-- A5. weapon_motion_links — (weapon_id, motion_type) joins
-- -----------------------------------------------------------------------------
-- Source: Court Case weapon_motion_links (85 rows)
-- Ships with seed data now; becomes live when Tier 1 case_motions uses it.
-- motion_type strings match Tier 1's strategic_motion_library.motion_type.

CREATE TABLE IF NOT EXISTS public.weapon_motion_links (
  weapon_id text NOT NULL,
  motion_type text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (weapon_id, motion_type),
  CONSTRAINT wml_weapon_id_fk
    FOREIGN KEY (weapon_id) REFERENCES public.legal_weapons_library(weapon_id)
);

CREATE INDEX IF NOT EXISTS idx_wml_motion_type
  ON public.weapon_motion_links (motion_type);

ALTER TABLE public.weapon_motion_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_weapon_motion_links"
  ON public.weapon_motion_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_weapon_motion_links"
  ON public.weapon_motion_links
  FOR ALL
  TO anon
  USING (false);


-- -----------------------------------------------------------------------------
-- A6. weapon_witness_links — (weapon_id, witness_type) joins
-- -----------------------------------------------------------------------------
-- Source: Court Case weapon_witness_links (23 rows)
-- Ties to existing case_witnesses.witness_type values.

CREATE TABLE IF NOT EXISTS public.weapon_witness_links (
  weapon_id text NOT NULL,
  witness_type text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (weapon_id, witness_type),
  CONSTRAINT wwl_weapon_id_fk
    FOREIGN KEY (weapon_id) REFERENCES public.legal_weapons_library(weapon_id)
);

CREATE INDEX IF NOT EXISTS idx_wwl_witness_type
  ON public.weapon_witness_links (witness_type);

ALTER TABLE public.weapon_witness_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_weapon_witness_links"
  ON public.weapon_witness_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_weapon_witness_links"
  ON public.weapon_witness_links
  FOR ALL
  TO anon
  USING (false);


-- -----------------------------------------------------------------------------
-- A7. weapon_evidence_links — (weapon_id, evidence_type) joins
-- -----------------------------------------------------------------------------
-- Source: Court Case weapon_evidence_links (27 rows)

CREATE TABLE IF NOT EXISTS public.weapon_evidence_links (
  weapon_id text NOT NULL,
  evidence_type text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (weapon_id, evidence_type),
  CONSTRAINT wel_weapon_id_fk
    FOREIGN KEY (weapon_id) REFERENCES public.legal_weapons_library(weapon_id)
);

CREATE INDEX IF NOT EXISTS idx_wel_evidence_type
  ON public.weapon_evidence_links (evidence_type);

ALTER TABLE public.weapon_evidence_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_weapon_evidence_links"
  ON public.weapon_evidence_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_weapon_evidence_links"
  ON public.weapon_evidence_links
  FOR ALL
  TO anon
  USING (false);


-- =============================================================================
-- SECTION B: Per-Case Tables (case_id FK to cases, ON DELETE CASCADE)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- B1. finding_attack_patterns — per-case mapping of findings to library patterns
-- -----------------------------------------------------------------------------
-- TABLE ALREADY EXISTS via Management API (confirmed in Phase 0 schema snapshot).
-- CREATE TABLE IF NOT EXISTS is a no-op against existing table.
-- ALTER TABLE ADD COLUMN IF NOT EXISTS adds any missing columns the worker needs.
-- Worker: attack-strategy-mapping.mjs (writes), witness-dossier-p2.mjs (reads),
--   prosecution-counter-prediction.mjs (reads), motion-recommendation.mjs (reads)

CREATE TABLE IF NOT EXISTS public.finding_attack_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  finding_id uuid,
  pattern_key text NOT NULL,
  strength text,
  rationale text,
  phase1_questions jsonb,
  phase2_questions jsonb,
  phase3_questions jsonb,
  kill_shot text,
  escape_routes text,
  meta_frame text,
  closing_callback text,
  voir_dire text,
  phase1_questions_applicable boolean DEFAULT true,
  kill_shot_applicable boolean DEFAULT true,
  generated_by text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Schema drift: add columns that may be missing from the Management API version
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS finding_id uuid;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS pattern_key text;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS strength text;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS rationale text;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS phase1_questions jsonb;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS phase2_questions jsonb;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS phase3_questions jsonb;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS kill_shot text;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS escape_routes text;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS meta_frame text;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS closing_callback text;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS voir_dire text;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS phase1_questions_applicable boolean DEFAULT true;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS kill_shot_applicable boolean DEFAULT true;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS generated_by text;
ALTER TABLE public.finding_attack_patterns
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_fap_case_id
  ON public.finding_attack_patterns (case_id);
CREATE INDEX IF NOT EXISTS idx_fap_case_finding
  ON public.finding_attack_patterns (case_id, finding_id);
CREATE INDEX IF NOT EXISTS idx_fap_pattern_key
  ON public.finding_attack_patterns (pattern_key);
CREATE INDEX IF NOT EXISTS idx_fap_strength
  ON public.finding_attack_patterns (strength);

ALTER TABLE public.finding_attack_patterns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'finding_attack_patterns'
      AND policyname = 'service_role_all_finding_attack_patterns'
  ) THEN
    CREATE POLICY "service_role_all_finding_attack_patterns"
      ON public.finding_attack_patterns
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'finding_attack_patterns'
      AND policyname = 'anon_no_access_finding_attack_patterns'
  ) THEN
    CREATE POLICY "anon_no_access_finding_attack_patterns"
      ON public.finding_attack_patterns
      FOR ALL
      TO anon
      USING (false);
  END IF;
END $$;

-- Trigger: conditional creation since table may already have one
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_finding_attack_patterns_updated_at'
  ) THEN
    CREATE TRIGGER update_finding_attack_patterns_updated_at
      BEFORE UPDATE ON public.finding_attack_patterns
      FOR EACH ROW
      EXECUTE FUNCTION moddatetime('updated_at');
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- B2. case_trial_themes — per-case theme rollup with linked findings/witnesses
-- -----------------------------------------------------------------------------
-- Source schema: Court Case trial_themes (25 rows per case, generated by workers)
-- Worker: trial-material.mjs (writes), report.mjs (reads)

CREATE TABLE IF NOT EXISTS public.case_trial_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  theme_name text NOT NULL,
  theme_type text,
  theme_summary text,
  supporting_findings jsonb DEFAULT '[]'::jsonb,
  supporting_witnesses jsonb DEFAULT '[]'::jsonb,
  supporting_case_law jsonb DEFAULT '[]'::jsonb,
  one_phrase_candidate text,
  strength text DEFAULT 'MEDIUM',
  use_in jsonb DEFAULT '[]'::jsonb,
  jury_psychology_notes text,
  repetition_count integer DEFAULT 0,
  related_arguments text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT case_trial_themes_strength_check
    CHECK (strength IN ('CRITICAL', 'STRONG', 'MEDIUM', 'SUPPORTING'))
);

CREATE INDEX IF NOT EXISTS idx_ctt_case_id
  ON public.case_trial_themes (case_id);
CREATE INDEX IF NOT EXISTS idx_ctt_case_strength
  ON public.case_trial_themes (case_id, strength);
CREATE INDEX IF NOT EXISTS idx_ctt_theme_type
  ON public.case_trial_themes (theme_type);

ALTER TABLE public.case_trial_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_case_trial_themes"
  ON public.case_trial_themes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_case_trial_themes"
  ON public.case_trial_themes
  FOR ALL
  TO anon
  USING (false);

CREATE TRIGGER update_case_trial_themes_updated_at
  BEFORE UPDATE ON public.case_trial_themes
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');


-- -----------------------------------------------------------------------------
-- B3. case_trial_narrative — per-case narrative skeleton
-- -----------------------------------------------------------------------------
-- Source schema: Court Case trial_narrative (6 rows per case)
-- narrative_type: master, opening, closing, cross_witness
-- Worker: trial-material.mjs (writes), report.mjs (reads)

CREATE TABLE IF NOT EXISTS public.case_trial_narrative (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  narrative_type text NOT NULL,
  archetype text,
  the_one_phrase text,
  story_arc jsonb,
  character_roles jsonb,
  emotional_core text,
  why_wouldnt_they text,
  bad_evidence_explained text,
  government_failures jsonb DEFAULT '[]'::jsonb,
  moral_appeal text,
  forbidden_words jsonb DEFAULT '[]'::jsonb,
  magic_words jsonb DEFAULT '[]'::jsonb,
  version integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ctn_case_id
  ON public.case_trial_narrative (case_id);
CREATE INDEX IF NOT EXISTS idx_ctn_case_type
  ON public.case_trial_narrative (case_id, narrative_type);
CREATE INDEX IF NOT EXISTS idx_ctn_active
  ON public.case_trial_narrative (is_active)
  WHERE is_active = true;

ALTER TABLE public.case_trial_narrative ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_case_trial_narrative"
  ON public.case_trial_narrative
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_case_trial_narrative"
  ON public.case_trial_narrative
  FOR ALL
  TO anon
  USING (false);

CREATE TRIGGER update_case_trial_narrative_updated_at
  BEFORE UPDATE ON public.case_trial_narrative
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');


-- -----------------------------------------------------------------------------
-- B4. case_one_phrase_candidates — per-case theme phrase competition
-- -----------------------------------------------------------------------------
-- Source schema: Court Case one_phrase_candidates (35 rows per case)
-- Alan Jackson THE ONE PHRASE scoring methodology
-- Worker: trial-material.mjs (writes), report.mjs (reads)

CREATE TABLE IF NOT EXISTS public.case_one_phrase_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  phrase_text text NOT NULL,
  source text,
  source_id uuid,
  effectiveness_score real,
  alan_jackson_criteria jsonb,
  tested_in jsonb DEFAULT '[]'::jsonb,
  jury_reaction_notes text,
  is_selected boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_copc_case_id
  ON public.case_one_phrase_candidates (case_id);
CREATE INDEX IF NOT EXISTS idx_copc_selected
  ON public.case_one_phrase_candidates (case_id, is_selected)
  WHERE is_selected = true;

ALTER TABLE public.case_one_phrase_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_case_one_phrase_candidates"
  ON public.case_one_phrase_candidates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_case_one_phrase_candidates"
  ON public.case_one_phrase_candidates
  FOR ALL
  TO anon
  USING (false);

CREATE TRIGGER update_case_one_phrase_candidates_updated_at
  BEFORE UPDATE ON public.case_one_phrase_candidates
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');


-- -----------------------------------------------------------------------------
-- B5. case_voir_dire_questions — per-case voir dire selections + customizations
-- -----------------------------------------------------------------------------
-- Source schema: Court Case voir_dire_questions (case-specific rows only)
-- Links to voir_dire_library for base questions + case_trial_themes for themes
-- Worker: trial-material.mjs voir_dire subtype (writes), report.mjs (reads)

CREATE TABLE IF NOT EXISTS public.case_voir_dire_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  linked_library_question_id bigint REFERENCES public.voir_dire_library(id),
  linked_theme_id uuid REFERENCES public.case_trial_themes(id),
  linked_finding_ids uuid[] DEFAULT '{}',
  customized_question_text text,
  purpose text,
  ideal_response text,
  disqualifying_response text,
  phase text,
  roy_black_seduction_level text,
  use_priority integer DEFAULT 5,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cvdq_case_id
  ON public.case_voir_dire_questions (case_id);
CREATE INDEX IF NOT EXISTS idx_cvdq_case_theme
  ON public.case_voir_dire_questions (case_id, linked_theme_id);
CREATE INDEX IF NOT EXISTS idx_cvdq_library_question
  ON public.case_voir_dire_questions (linked_library_question_id);

ALTER TABLE public.case_voir_dire_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_case_voir_dire_questions"
  ON public.case_voir_dire_questions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_case_voir_dire_questions"
  ON public.case_voir_dire_questions
  FOR ALL
  TO anon
  USING (false);

CREATE TRIGGER update_case_voir_dire_questions_updated_at
  BEFORE UPDATE ON public.case_voir_dire_questions
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');


-- -----------------------------------------------------------------------------
-- B6. cross_witness_patterns — per-case cross-witness pattern detection
-- -----------------------------------------------------------------------------
-- Source schema: Court Case cross_witness_patterns (28 rows per case, all
--   case-specific — schema ports, data does NOT)
-- SHARED with Tier 7 (witness-research.mjs) per FINAL-CODE-REVIEW finding B5.
-- Tier 2 attack-intel.mjs writes to this; Tier 7 witness-research.mjs also writes.
-- Tier 7 creates this table in Wave 3 IF it does not exist; this migration
-- creates it in Wave 2 so both producers can use it.
-- Worker: attack-intel.mjs (writes), witness-research.mjs (writes), report.mjs (reads)

CREATE TABLE IF NOT EXISTS public.cross_witness_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  source_witness_id uuid,
  target_witness_id uuid,
  pattern_type text NOT NULL,
  description text,
  strategic_value text,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT cwp_pattern_type_check
    CHECK (pattern_type IN (
      'SAME_UNIT', 'SAME_INCIDENT', 'SAME_SUPERVISOR', 'UNIT_CULTURE',
      'BADGE_HISTORY', 'TRAINING_OVERLAP', 'DISCIPLINE_OVERLAP',
      'TESTIMONY_CONTRADICTION'
    ))
);

CREATE INDEX IF NOT EXISTS idx_cwp_case_id
  ON public.cross_witness_patterns (case_id);
CREATE INDEX IF NOT EXISTS idx_cwp_source_witness
  ON public.cross_witness_patterns (source_witness_id);
CREATE INDEX IF NOT EXISTS idx_cwp_target_witness
  ON public.cross_witness_patterns (target_witness_id);
CREATE INDEX IF NOT EXISTS idx_cwp_pattern_type
  ON public.cross_witness_patterns (pattern_type);

ALTER TABLE public.cross_witness_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_cross_witness_patterns"
  ON public.cross_witness_patterns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_cross_witness_patterns"
  ON public.cross_witness_patterns
  FOR ALL
  TO anon
  USING (false);

CREATE TRIGGER update_cross_witness_patterns_updated_at
  BEFORE UPDATE ON public.cross_witness_patterns
  FOR EACH ROW
  EXECUTE FUNCTION moddatetime('updated_at');


-- =============================================================================
-- SECTION C: Verification queries (run manually post-apply)
-- =============================================================================
--
-- -- Library tables exist (expect 7 rows):
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN (
--     'attack_patterns_library', 'legal_weapons_library', 'voir_dire_library',
--     'weapon_finding_links', 'weapon_motion_links',
--     'weapon_witness_links', 'weapon_evidence_links'
--   ) ORDER BY tablename;
--
-- -- Per-case tables exist (expect 6 rows):
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN (
--     'finding_attack_patterns', 'case_trial_themes', 'case_trial_narrative',
--     'case_one_phrase_candidates', 'case_voir_dire_questions',
--     'cross_witness_patterns'
--   ) ORDER BY tablename;
--
-- -- RLS enabled on all new Wave 2 tables (expect 13 rows, all rowsecurity=t):
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'attack_patterns_library', 'legal_weapons_library', 'voir_dire_library',
--     'weapon_finding_links', 'weapon_motion_links',
--     'weapon_witness_links', 'weapon_evidence_links',
--     'finding_attack_patterns', 'case_trial_themes', 'case_trial_narrative',
--     'case_one_phrase_candidates', 'case_voir_dire_questions',
--     'cross_witness_patterns'
--   );
--
-- -- finding_attack_patterns drift check — all worker columns present:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'finding_attack_patterns'
--   AND column_name IN (
--     'id','case_id','finding_id','pattern_key','strength','rationale',
--     'phase1_questions','phase2_questions','phase3_questions','kill_shot',
--     'escape_routes','meta_frame','closing_callback','voir_dire',
--     'phase1_questions_applicable','kill_shot_applicable','generated_by',
--     'created_at','updated_at'
--   ) ORDER BY column_name;
--
-- -- Seed counts (expect 0 for all — seed data ships in follow-up migration):
-- SELECT 'attack_patterns_library' AS t, count(*) FROM attack_patterns_library
-- UNION ALL SELECT 'legal_weapons_library', count(*) FROM legal_weapons_library
-- UNION ALL SELECT 'voir_dire_library', count(*) FROM voir_dire_library
-- UNION ALL SELECT 'weapon_finding_links', count(*) FROM weapon_finding_links
-- UNION ALL SELECT 'weapon_motion_links', count(*) FROM weapon_motion_links
-- UNION ALL SELECT 'weapon_witness_links', count(*) FROM weapon_witness_links
-- UNION ALL SELECT 'weapon_evidence_links', count(*) FROM weapon_evidence_links;
--
-- -- CASCADE safety: library tables do NOT cascade from core tables:
-- SELECT conrelid::regclass AS child, confrelid::regclass AS parent
-- FROM pg_constraint
-- WHERE contype = 'f'
--   AND confrelid::regclass::text IN ('cases', 'orders', 'intakes')
--   AND conrelid::regclass::text IN (
--     'attack_patterns_library', 'legal_weapons_library', 'voir_dire_library',
--     'weapon_finding_links', 'weapon_motion_links',
--     'weapon_witness_links', 'weapon_evidence_links'
--   );
-- (Expect 0 rows — library tables must NEVER cascade from core tables)
--
-- =============================================================================
