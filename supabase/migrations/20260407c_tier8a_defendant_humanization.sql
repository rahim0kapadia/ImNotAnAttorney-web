-- =============================================================================
-- Court Case -> INAA Port — Wave 1 — Tier 8A: Defendant Humanization
-- =============================================================================
--
-- Spec: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-court-case-port\08-misc-high-value.md
--       (Section 8A ONLY — sub-sprints 8B and 8C ship in Waves 3 and 4)
-- Wave: 1 of 4 (Foundation + Net-New Positioning)
-- Order: THIRD — no FK dependency on Tier 5 or Tier 1, can run last safely.
--
-- This migration:
--   1. CREATEs defendant_profiles (one row per case, UNIQUE case_id)
--   2. CREATEs case_intelligence (multi-row per case, operator-populated for
--      War Room+ tier, customer-filtered for X-Ray/IB tiers)
--   3. Adds CHECK constraints on verification_status, disclosure_restriction,
--      intel_category (idempotent via DO $$ blocks)
--   4. RLS service_role_full_access + anon_no_access
--   5. Indexes including partials for disclosure_restriction != 'none' and
--      intel_category IS NOT NULL (common query paths)
--
-- Feature flag gating: defendant_humanization (Phase 0 — currently OFF).
-- Gating is primarily data-presence based — if defendant_profiles row missing,
-- Edge Function falls back to the existing intake-string path.
--
-- NO SEED DATA — tables start empty. defendant_profiles rows are seeded per-case
-- by src/lib/defendant-profile.ts seedDefendantProfile() after intake save.
-- case_intelligence rows are operator-populated (War Room+ only).
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1: defendant_profiles
-- -----------------------------------------------------------------------------
-- Purpose: Per-case defendant background, vulnerabilities, and humanization
-- facts. Feeds Letter to You + What's Working sections in CD/IB reports.
-- One row per case (UNIQUE case_id).

CREATE TABLE IF NOT EXISTS public.defendant_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  intake_id uuid REFERENCES public.intakes(id),

  -- Background (sourced from intake + operator augmentation)
  criminal_history_facts jsonb DEFAULT '[]'::jsonb,
    -- structured array: [{type, year, disposition, source, weight}]
  mental_health_notes text,
  education_level text,
  employment_history text,
  family_status text,
  military_service text,
  community_ties text,

  -- Vulnerabilities (drive Miranda/competency questions in reports)
  intellectual_disability boolean DEFAULT false,
  juvenile_at_time boolean DEFAULT false,
  mental_illness_diagnosis text,
  language_primary text,
  interpreter_needed boolean DEFAULT false,
  substance_abuse_history text,

  -- Defense narrative (drives Letter to You + What's Working sections)
  humanization_facts jsonb DEFAULT '[]'::jsonb,
    -- structured array: [{fact, category, harvest_consent_status}]
    -- category enum: 'family', 'work', 'community', 'health', 'service', 'other'
  alibi_summary text,
  defense_theory_notes text,

  -- Tracking (drives downstream auto-generated questions)
  vulnerability_flags jsonb DEFAULT '[]'::jsonb,
    -- structured array: ['miranda_at_risk', 'edwards_violation', 'competency_question', ...]
  auto_findings jsonb DEFAULT '[]'::jsonb,
    -- structured array of finding TYPES this profile makes relevant

  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT defendant_profiles_case_id_unique UNIQUE (case_id)
);

CREATE INDEX IF NOT EXISTS idx_defendant_profiles_case_id
  ON public.defendant_profiles (case_id);
CREATE INDEX IF NOT EXISTS idx_defendant_profiles_intake_id
  ON public.defendant_profiles (intake_id)
  WHERE intake_id IS NOT NULL;

ALTER TABLE public.defendant_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_defendant_profiles"
  ON public.defendant_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_defendant_profiles"
  ON public.defendant_profiles
  FOR ALL
  TO anon
  USING (false);

-- -----------------------------------------------------------------------------
-- SECTION 2: case_intelligence
-- -----------------------------------------------------------------------------
-- Purpose: Facts beyond discovery (codefendant outcomes, prosecution theory
-- weak points, witness contradictions) with verification tiers that drive
-- customer-facing qualifying language.
-- Multiple rows per case, operator-populated (War Room+ mostly).

CREATE TABLE IF NOT EXISTS public.case_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,

  -- Core fact
  fact_summary text NOT NULL,
  fact_detail text,

  -- Source tracking
  source_type text NOT NULL,
    -- enum: external_record, manual_analysis, phone_extraction,
    --       witness_statement, court_filing, attorney_disclosure
  source_reference text,
  source_date date,

  -- Linkages
  finding_id uuid REFERENCES public.case_findings(id),
  witness_id uuid REFERENCES public.case_witnesses(id),

  -- Classification
  intel_category text,
    -- enum: codefendant, ci_related, external_contact,
    --       unidentified_subject, theory, court_record
  legal_significance text,
    -- enum: appellate_issue, brady_material, impeachment, narrative
  deployment_phase text,
    -- enum: pretrial, trial_only, closing, cross_exam, voir_dire

  -- Verification status (renders as qualifying language in reports)
  verification_status text NOT NULL DEFAULT 'unverified',
    -- enum: confirmed, supported, theory, unverified
  verification_source text,
  verified_date date,

  -- Disclosure controls (gates customer visibility by tier)
  disclosure_restriction text NOT NULL DEFAULT 'none',
    -- enum: none, attorney_only, trial_only, do_not_disclose

  -- Metadata
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CHECK constraints via idempotent DO block
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_intelligence_verification_check') THEN
    ALTER TABLE public.case_intelligence
      ADD CONSTRAINT case_intelligence_verification_check
      CHECK (verification_status IN ('confirmed', 'supported', 'theory', 'unverified'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_intelligence_disclosure_check') THEN
    ALTER TABLE public.case_intelligence
      ADD CONSTRAINT case_intelligence_disclosure_check
      CHECK (disclosure_restriction IN ('none', 'attorney_only', 'trial_only', 'do_not_disclose'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_intelligence_intel_category_check') THEN
    ALTER TABLE public.case_intelligence
      ADD CONSTRAINT case_intelligence_intel_category_check
      CHECK (intel_category IS NULL OR intel_category IN
        ('codefendant', 'ci_related', 'external_contact',
         'unidentified_subject', 'theory', 'court_record'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_intelligence_source_type_check') THEN
    ALTER TABLE public.case_intelligence
      ADD CONSTRAINT case_intelligence_source_type_check
      CHECK (source_type IN
        ('external_record', 'manual_analysis', 'phone_extraction',
         'witness_statement', 'court_filing', 'attorney_disclosure'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_case_intelligence_case_id
  ON public.case_intelligence (case_id);
CREATE INDEX IF NOT EXISTS idx_case_intelligence_disclosure
  ON public.case_intelligence (disclosure_restriction)
  WHERE disclosure_restriction != 'none';
CREATE INDEX IF NOT EXISTS idx_case_intelligence_verification
  ON public.case_intelligence (verification_status);
CREATE INDEX IF NOT EXISTS idx_case_intelligence_intel_category
  ON public.case_intelligence (intel_category)
  WHERE intel_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_intelligence_finding
  ON public.case_intelligence (finding_id)
  WHERE finding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_intelligence_witness
  ON public.case_intelligence (witness_id)
  WHERE witness_id IS NOT NULL;

ALTER TABLE public.case_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_case_intelligence"
  ON public.case_intelligence
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_no_access_case_intelligence"
  ON public.case_intelligence
  FOR ALL
  TO anon
  USING (false);

-- -----------------------------------------------------------------------------
-- SECTION 3: moddatetime triggers
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS update_defendant_profiles_updated_at ON public.defendant_profiles;
CREATE TRIGGER update_defendant_profiles_updated_at
  BEFORE UPDATE ON public.defendant_profiles
  FOR EACH ROW EXECUTE FUNCTION moddatetime('last_updated');

DROP TRIGGER IF EXISTS update_case_intelligence_updated_at ON public.case_intelligence;
CREATE TRIGGER update_case_intelligence_updated_at
  BEFORE UPDATE ON public.case_intelligence
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

-- =============================================================================
-- Verification queries (run manually post-apply):
--
-- -- New tables exist (expect 2 rows):
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public'
--   AND tablename IN ('defendant_profiles', 'case_intelligence')
-- ORDER BY tablename;
--
-- -- CHECK constraints in place (expect 4 rows):
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'case_intelligence'::regclass AND contype = 'c'
-- ORDER BY conname;
--
-- -- defendant_profiles unique constraint on case_id (expect 1 row):
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'defendant_profiles'::regclass
--   AND contype = 'u' AND conname = 'defendant_profiles_case_id_unique';
--
-- -- RLS enabled (expect 2 rows, all t):
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('defendant_profiles', 'case_intelligence');
--
-- -- Row counts (expect 0 — seeded per-case by application code):
-- SELECT 'defendant_profiles' AS t, count(*) FROM defendant_profiles
-- UNION ALL SELECT 'case_intelligence', count(*) FROM case_intelligence;
--
-- =============================================================================
