-- =============================================================================
-- Court Case -> INAA Port -- Wave 2 -- Tier 6: Case Law Pipeline Enrichment
-- =============================================================================
--
-- Spec: C:\Users\email\projects\ImNotAnAttorney\docs\plans\2026-04-06-court-case-port\06-case-law-enrichment.md
-- Wave: 2 of 4 (parallel with Tier 2 Cross-Exam Library)
-- Order: FIFTH -- after 20260407c_tier8a_defendant_humanization.sql (Wave 1 complete)
--
-- PRODUCTION STATE (discovered via dry-run):
--   - `case_law` EXISTS with 15 columns (created by engine workers via live SQL).
--     Shape differs from plan: `binding_authority` not `is_binding`, `source_url`
--     not `verification_url`, `applicability_score` is real not integer,
--     `decision_date` is date not text. We preserve existing columns and ADD
--     the ~31 missing columns via ALTER TABLE ADD COLUMN IF NOT EXISTS.
--   - `verified_case_law` EXISTS with 35 columns (created by citation-verify.mjs
--     via live SQL). Has extra columns (jurisdiction, statute_text_excerpt,
--     holding, key_quote) beyond plan. sources_checked/confirmed are jsonb not
--     text[]. We ADD the ~5 missing columns; do not alter existing types.
--   - `case_law_urls`, `case_law_applicability`, `case_law_verification_log`,
--     `case_law_witnesses` do NOT exist -- created fresh.
--
-- This migration:
--   1. ALTERs `case_law` to add ~31 missing columns (strategic enrichment,
--      argument linking, prosecution anticipation, verification metadata)
--   2. CREATEs 4 new per-case tables:
--      case_law_urls, case_law_applicability, case_law_verification_log,
--      case_law_witnesses
--   3. ALTERs `verified_case_law` to add missing columns
--   4. Indexes (partial indexes on strategic boolean flags)
--   5. RLS + service_role + anon policies
--   6. moddatetime triggers on tables with updated_at
--
-- Hallucination prevention columns:
--   - case_law.fetched_holding + holding_match_score (< 0.3 = suspected fabrication)
--   - case_law.web_verified_status/source/date (HTTP verification metadata)
--   - case_law.needs_shepardization (treatment check queue flag)
--   - case_law.defense_favorable (tri-state: true/false/NULL=unclassified)
--   - case_law.is_good_law (NULL = unverified, never defaults to true)
--   - case_law_verification_log (full audit trail per check)
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1: CREATE case_law IF NOT EXISTS (idempotent baseline)
-- -----------------------------------------------------------------------------
-- If the table already exists (it does in production), this is a no-op.
-- The ALTER block in Section 2 handles column drift.

CREATE TABLE IF NOT EXISTS public.case_law (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id                 uuid        NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  case_name               text        NOT NULL,
  citation                text        NOT NULL,
  court                   text,
  year                    integer,
  holding                 text,
  is_good_law             boolean,     -- NULL = unverified (NEVER defaults to true)
  coverage_status         text,
  applicability_score     real,
  is_prosecution_citation boolean     DEFAULT false,
  our_distinction         text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- SECTION 2: ALTER case_law -- add missing columns
-- -----------------------------------------------------------------------------
-- Production has 15 columns. We need ~31 more for the full strategic schema.
-- Existing columns are left as-is (binding_authority, source_url, verified_at,
-- decision_date as date type -- all kept for backwards compat with engine code).

-- Core columns the engine workers expect
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS key_quote text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS motion_topic text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS motion_types text[] DEFAULT '{}';
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS attack_vectors text[] DEFAULT '{}';
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS finding_types text[] DEFAULT '{}';
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS verification_url text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS is_binding boolean;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS is_good_law boolean;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS research_source text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS year integer;

-- Applicability (single-score -- existing applicability_score is real, keep it)
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS applicability_label text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS score_rationale text;

-- Argument linking
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS relevant_arguments text[] DEFAULT '{}';
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS linked_finding_ids text[] DEFAULT '{}';
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS holding_keywords text[] DEFAULT '{}';

-- Prosecution anticipation
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS prosecution_use text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS distinction_strength text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS prosecution_counter_id uuid;

-- Strategic enrichment (the high-leverage adds from Court Case)
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS is_joa_case boolean DEFAULT false;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS joa_argument_type text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS is_danger_case boolean DEFAULT false;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS danger_case_motion_type text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS fetched_holding text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS holding_match_score real;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS negative_treatment text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS citing_cases_count integer DEFAULT 0;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS tactical_timing text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS condemnation_level integer DEFAULT 0;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS factual_scenario text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS mandatory_language text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS defense_favorable boolean;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS parallel_citations text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS case_type text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS docket_number text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS pinpoint_citation text;

-- Verification metadata (5-layer hallucination prevention)
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS web_verified_status text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS web_verified_source text;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS web_verified_date timestamptz;
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS needs_shepardization boolean DEFAULT true;

-- updated_at (production may not have it)
ALTER TABLE public.case_law
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Unique constraint on (case_id, citation) -- may already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.case_law'::regclass
      AND conname = 'case_law_case_citation_unique'
  ) THEN
    -- Check if any other unique constraint on (case_id, citation) exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a1 ON a1.attrelid = c.conrelid AND a1.attnum = ANY(c.conkey) AND a1.attname = 'case_id'
      JOIN pg_attribute a2 ON a2.attrelid = c.conrelid AND a2.attnum = ANY(c.conkey) AND a2.attname = 'citation'
      WHERE c.conrelid = 'public.case_law'::regclass
        AND c.contype = 'u'
    ) THEN
      ALTER TABLE public.case_law
        ADD CONSTRAINT case_law_case_citation_unique UNIQUE (case_id, citation);
    END IF;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- SECTION 3: case_law_urls -- multi-source ranked URLs per case law entry
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.case_law_urls (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_law_id     uuid        NOT NULL REFERENCES public.case_law(id) ON DELETE CASCADE,
  url             text        NOT NULL,
  source_type     text,       -- 'official', 'justia', 'courtlistener', 'google_scholar', 'govinfo', 'cornell_lii'
  is_verified     boolean     DEFAULT false,
  last_checked    timestamptz,
  http_status     integer,
  priority        integer     DEFAULT 99,   -- Lower = better (1=official, 2=justia, etc.)
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT case_law_urls_unique UNIQUE (case_law_id, url)
);

-- -----------------------------------------------------------------------------
-- SECTION 4: case_law_applicability -- per-motion-type scoring
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.case_law_applicability (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_law_id             uuid        NOT NULL REFERENCES public.case_law(id) ON DELETE CASCADE,
  motion_type             text        NOT NULL,
  motion_recommendation_id uuid,       -- optional FK to motion_recommendations(id)
  applicability_score     real,        -- 0.0-1.0
  applicability_level     text,        -- 'STRONG', 'MODERATE', 'WEAK', 'REVIEW'
  matched_keywords        jsonb       DEFAULT '[]'::jsonb,
  argument_match          text,
  holding_alignment       text,        -- 'defense_favorable', 'state_favorable', 'neutral'
  analysis_notes          text,
  manual_override         text,
  analyzed_at             timestamptz DEFAULT now(),

  CONSTRAINT case_law_applicability_unique
    UNIQUE (case_law_id, motion_type, motion_recommendation_id)
);

-- -----------------------------------------------------------------------------
-- SECTION 5: case_law_verification_log -- audit trail for every check
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.case_law_verification_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_law_id     uuid        NOT NULL REFERENCES public.case_law(id) ON DELETE CASCADE,
  check_type      text        NOT NULL,  -- 'age', 'url', 'holding', 'treatment', 'binding', 'existence'
  status          text        NOT NULL,  -- 'current', 'valid', 'stale', 'invalid', 'not_found'
  details         text,
  source          text,                  -- 'courtlistener', 'justia', 'ecfr', 'govinfo', 'cornell_lii'
  checked_at      timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- SECTION 6: case_law_witnesses -- case-to-witness links
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.case_law_witnesses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_law_id     uuid        NOT NULL REFERENCES public.case_law(id) ON DELETE CASCADE,
  witness_id      uuid        NOT NULL REFERENCES public.case_witnesses(id) ON DELETE CASCADE,
  context         text,
  discovered_at   timestamptz DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT case_law_witnesses_unique UNIQUE (case_law_id, witness_id)
);

-- -----------------------------------------------------------------------------
-- SECTION 7: ALTER verified_case_law -- add missing columns
-- -----------------------------------------------------------------------------
-- Production has 35 columns. Plan calls for a few that are missing.
-- Existing type differences (sources_checked/confirmed as jsonb instead of
-- text[], jurisdiction, statute_text_excerpt, holding, key_quote) are kept.

-- CREATE TABLE IF NOT EXISTS as safety net (no-op if exists)
CREATE TABLE IF NOT EXISTS public.verified_case_law (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  citation                  text        UNIQUE NOT NULL,
  case_name                 text        NOT NULL DEFAULT 'Unknown',
  verification_status       text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Add any columns that might be missing from the live table
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS citation_normalized text;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS court text;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS year integer;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS verification_count integer DEFAULT 0;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS confidence_tier text;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS verification_url text;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS verification_urls jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS sources_checked jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS sources_confirmed jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS verification_source text;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS is_good_law boolean;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS negative_treatment jsonb;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS shepardized_at timestamptz;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS courtlistener_cluster_id text;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS holding_validation text;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS fetched_holding text;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS holding_similarity real;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS age_status text;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS citation_type text DEFAULT 'case_law';
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS full_opinion_text text;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS opinion_html text;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS citation_count integer;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS is_landmark boolean;
ALTER TABLE public.verified_case_law
  ADD COLUMN IF NOT EXISTS treatment_score jsonb;

-- -----------------------------------------------------------------------------
-- SECTION 8: INDEXES
-- -----------------------------------------------------------------------------

-- case_law indexes
CREATE INDEX IF NOT EXISTS idx_case_law_case_id
  ON public.case_law (case_id);
CREATE INDEX IF NOT EXISTS idx_case_law_citation
  ON public.case_law (citation);
-- Partial indexes on strategic boolean flags (only index the true/non-null rows)
CREATE INDEX IF NOT EXISTS idx_case_law_joa
  ON public.case_law (is_joa_case) WHERE is_joa_case = true;
CREATE INDEX IF NOT EXISTS idx_case_law_danger
  ON public.case_law (is_danger_case) WHERE is_danger_case = true;
CREATE INDEX IF NOT EXISTS idx_case_law_prosecution
  ON public.case_law (is_prosecution_citation) WHERE is_prosecution_citation = true;
CREATE INDEX IF NOT EXISTS idx_case_law_coverage
  ON public.case_law (coverage_status);
CREATE INDEX IF NOT EXISTS idx_case_law_defense_fav
  ON public.case_law (defense_favorable) WHERE defense_favorable IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_law_timing
  ON public.case_law (tactical_timing) WHERE tactical_timing IS NOT NULL;

-- case_law_urls indexes
CREATE INDEX IF NOT EXISTS idx_case_law_urls_case_law
  ON public.case_law_urls (case_law_id);
CREATE INDEX IF NOT EXISTS idx_case_law_urls_source
  ON public.case_law_urls (source_type);
CREATE INDEX IF NOT EXISTS idx_case_law_urls_priority
  ON public.case_law_urls (case_law_id, priority);

-- case_law_applicability indexes
CREATE INDEX IF NOT EXISTS idx_case_law_applicability_case_law
  ON public.case_law_applicability (case_law_id);
CREATE INDEX IF NOT EXISTS idx_case_law_applicability_motion
  ON public.case_law_applicability (motion_type);
CREATE INDEX IF NOT EXISTS idx_case_law_applicability_level
  ON public.case_law_applicability (applicability_level);

-- case_law_verification_log indexes
CREATE INDEX IF NOT EXISTS idx_case_law_vlog_case_law
  ON public.case_law_verification_log (case_law_id);
CREATE INDEX IF NOT EXISTS idx_case_law_vlog_type
  ON public.case_law_verification_log (check_type);

-- case_law_witnesses indexes
CREATE INDEX IF NOT EXISTS idx_case_law_witnesses_case_law
  ON public.case_law_witnesses (case_law_id);
CREATE INDEX IF NOT EXISTS idx_case_law_witnesses_witness
  ON public.case_law_witnesses (witness_id);

-- verified_case_law indexes
CREATE INDEX IF NOT EXISTS idx_vcl_confidence
  ON public.verified_case_law (confidence_tier);
CREATE INDEX IF NOT EXISTS idx_vcl_good_law
  ON public.verified_case_law (is_good_law) WHERE is_good_law IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vcl_cluster
  ON public.verified_case_law (courtlistener_cluster_id) WHERE courtlistener_cluster_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- SECTION 9: RLS -- all 6 tables
-- -----------------------------------------------------------------------------

ALTER TABLE public.case_law ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_law_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_law_applicability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_law_verification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_law_witnesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_case_law ENABLE ROW LEVEL SECURITY;

-- Service role full access + anon no access (DO block for all 6 tables)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'case_law', 'case_law_urls', 'case_law_applicability',
    'case_law_verification_log', 'case_law_witnesses', 'verified_case_law'
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

-- verified_case_law additionally gets authenticated read access (future portal)
DROP POLICY IF EXISTS "authenticated_read_verified_case_law" ON public.verified_case_law;
CREATE POLICY "authenticated_read_verified_case_law"
  ON public.verified_case_law
  FOR SELECT TO authenticated USING (true);

-- -----------------------------------------------------------------------------
-- SECTION 10: moddatetime triggers
-- -----------------------------------------------------------------------------
-- Only tables with updated_at columns: case_law, verified_case_law

DROP TRIGGER IF EXISTS update_case_law_updated_at ON public.case_law;
CREATE TRIGGER update_case_law_updated_at
  BEFORE UPDATE ON public.case_law
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

DROP TRIGGER IF EXISTS update_verified_case_law_updated_at ON public.verified_case_law;
CREATE TRIGGER update_verified_case_law_updated_at
  BEFORE UPDATE ON public.verified_case_law
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

-- =============================================================================
-- Verification queries (run manually post-apply):
--
-- -- All 6 tables exist (expect 6 rows):
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN (
--     'case_law', 'case_law_urls', 'case_law_applicability',
--     'case_law_verification_log', 'case_law_witnesses', 'verified_case_law'
--   );
--
-- -- case_law has strategic columns (expect all non-null):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'case_law' AND table_schema = 'public'
--   AND column_name IN (
--     'is_joa_case', 'is_danger_case', 'fetched_holding', 'holding_match_score',
--     'negative_treatment', 'citing_cases_count', 'tactical_timing',
--     'condemnation_level', 'factual_scenario', 'mandatory_language',
--     'defense_favorable', 'needs_shepardization', 'web_verified_status'
--   )
-- ORDER BY column_name;
--
-- -- New tables have correct column counts:
-- SELECT t.table_name, count(c.column_name) as col_count
-- FROM information_schema.tables t
-- JOIN information_schema.columns c ON c.table_name = t.table_name AND c.table_schema = t.table_schema
-- WHERE t.table_schema = 'public'
--   AND t.table_name IN ('case_law_urls', 'case_law_applicability',
--     'case_law_verification_log', 'case_law_witnesses')
-- GROUP BY t.table_name ORDER BY t.table_name;
--
-- -- RLS enabled on all 6 tables:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'case_law', 'case_law_urls', 'case_law_applicability',
--     'case_law_verification_log', 'case_law_witnesses', 'verified_case_law'
--   );
--
-- -- Partial indexes on case_law:
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'case_law' AND indexdef LIKE '%WHERE%';
--
-- -- moddatetime triggers:
-- SELECT trigger_name, event_object_table FROM information_schema.triggers
-- WHERE trigger_name IN (
--   'update_case_law_updated_at', 'update_verified_case_law_updated_at'
-- );
--
-- =============================================================================
