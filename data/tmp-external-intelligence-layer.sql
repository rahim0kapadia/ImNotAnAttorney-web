-- External Intelligence Layer — 8 new tables for the Shared Intelligence Layer
-- Part of Data Intelligence Platform Phase 1.
-- See: docs/superpowers/specs/2026-04-11-data-intelligence-platform-design.md
--
-- Tables: officer_external_intel, judge_sentencing_patterns, prosecution_profiles,
--         outcome_benchmarks, exoneration_patterns, forensic_lab_profiles,
--         citation_authority, data_source_freshness
--
-- Applied via Supabase Management API.

-- Extensions first (required by GIN trgm indexes below)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── officer_external_intel ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS officer_external_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_name text NOT NULL,
  officer_name_normalized text NOT NULL,
  state text,
  agency text,
  brady_status text,
  brady_reason text,
  giglio_letter_date date,
  npi_employment_history jsonb,
  npi_is_wandering_officer boolean,
  decertified boolean DEFAULT false,
  decertification_state text,
  decertification_date date,
  decertification_reason text,
  complaint_count integer DEFAULT 0,
  use_of_force_count integer DEFAULT 0,
  sustained_complaints integer DEFAULT 0,
  credibility_risk_score integer,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (officer_name_normalized, state, agency)
);

CREATE INDEX IF NOT EXISTS idx_officer_ext_name ON officer_external_intel
  USING gin (officer_name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_officer_ext_state ON officer_external_intel (state);

-- ── judge_sentencing_patterns ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS judge_sentencing_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_name text NOT NULL,
  judge_name_normalized text NOT NULL,
  district text,
  state text,
  total_cases integer DEFAULT 0,
  median_sentence_months numeric,
  mean_sentence_months numeric,
  p25_sentence_months numeric,
  p75_sentence_months numeric,
  downward_departure_rate numeric,
  upward_departure_rate numeric,
  substantial_assistance_rate numeric,
  government_sponsored_below_range_rate numeric,
  offense_breakdown jsonb,
  criminal_history_breakdown jsonb,
  fl_scoresheet_count integer,
  fl_avg_scoresheet_total numeric,
  fl_departure_reasons jsonb,
  retention_elections jsonb,
  aba_rating text,
  aba_rating_year integer,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  data_period text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (judge_name_normalized, district)
);

CREATE INDEX IF NOT EXISTS idx_judge_sent_name ON judge_sentencing_patterns
  USING gin (judge_name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_judge_sent_district ON judge_sentencing_patterns (district);
CREATE INDEX IF NOT EXISTS idx_judge_sent_state ON judge_sentencing_patterns (state);

-- ── prosecution_profiles ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prosecution_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_name text NOT NULL,
  office_type text NOT NULL,
  state text,
  district text,
  county text,
  total_cases_annual integer,
  conviction_rate numeric,
  dismissal_rate numeric,
  declination_rate numeric,
  plea_rate numeric,
  trial_rate numeric,
  avg_sentence_months numeric,
  offense_breakdown jsonb,
  racial_disparity_data jsonb,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  data_period text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (office_name, state)
);

CREATE INDEX IF NOT EXISTS idx_prosecution_state ON prosecution_profiles (state);
CREATE INDEX IF NOT EXISTS idx_prosecution_district ON prosecution_profiles (district);

-- ── outcome_benchmarks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outcome_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_level text NOT NULL,
  jurisdiction_name text NOT NULL,
  state text,
  offense_type text NOT NULL,
  offense_category text,
  total_cases integer,
  conviction_rate numeric,
  acquittal_rate numeric,
  dismissal_rate numeric,
  probation_rate numeric,
  jail_rate numeric,
  prison_rate numeric,
  median_sentence_months numeric,
  mean_sentence_months numeric,
  plea_conviction_rate numeric,
  trial_conviction_rate numeric,
  plea_avg_sentence_months numeric,
  trial_avg_sentence_months numeric,
  plea_trial_penalty_pct numeric,
  criminal_history_breakdown jsonb,
  avg_days_to_disposition integer,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  data_period text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (jurisdiction_level, jurisdiction_name, offense_type)
);

CREATE INDEX IF NOT EXISTS idx_outcome_jurisdiction ON outcome_benchmarks (jurisdiction_level, jurisdiction_name);
CREATE INDEX IF NOT EXISTS idx_outcome_offense ON outcome_benchmarks (offense_type);
CREATE INDEX IF NOT EXISTS idx_outcome_state ON outcome_benchmarks (state);

-- ── exoneration_patterns ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exoneration_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offense_type text NOT NULL,
  offense_category text,
  total_exonerations integer,
  false_confession_pct numeric,
  mistaken_id_pct numeric,
  perjury_pct numeric,
  official_misconduct_pct numeric,
  inadequate_defense_pct numeric,
  forensic_error_pct numeric,
  false_accusation_pct numeric,
  avg_years_served numeric,
  top_factor text,
  top_factor_pct numeric,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (offense_type)
);

CREATE INDEX IF NOT EXISTS idx_exoneration_offense ON exoneration_patterns (offense_type);

-- ── forensic_lab_profiles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forensic_lab_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_name text NOT NULL,
  state text NOT NULL,
  county text,
  accreditation_status text,
  accrediting_body text,
  last_audit_date date,
  annual_case_count integer,
  backlog_count integer,
  avg_turnaround_days integer,
  proficiency_test_failures integer,
  proficiency_test_total integer,
  disciplines text[],
  known_issues jsonb,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (lab_name, state)
);

CREATE INDEX IF NOT EXISTS idx_forensic_lab_state ON forensic_lab_profiles (state);

-- ── citation_authority ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS citation_authority (
  cluster_id text PRIMARY KEY,
  case_name text,
  total_citing_opinions integer DEFAULT 0,
  avg_citation_depth numeric,
  max_citation_depth integer,
  positive_treatment_count integer DEFAULT 0,
  negative_treatment_count integer DEFAULT 0,
  distinguishing_count integer DEFAULT 0,
  authority_score numeric,
  source_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(source_urls) > 0),
  sources text[] NOT NULL DEFAULT '{}',
  data_as_of timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── data_source_freshness ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_source_freshness (
  source_key text PRIMARY KEY,
  source_name text NOT NULL,
  source_url text,
  last_ingested_at timestamptz,
  last_row_count integer,
  next_expected_update text,
  staleness_threshold_days integer DEFAULT 90,
  is_stale boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Extensions to existing tables ───────────────────────────────────────────

ALTER TABLE case_law
  ADD COLUMN IF NOT EXISTS citation_depth integer,
  ADD COLUMN IF NOT EXISTS authority_score numeric;

ALTER TABLE officer_reliability
  ADD COLUMN IF NOT EXISTS external_intel_id uuid REFERENCES officer_external_intel(id),
  ADD COLUMN IF NOT EXISTS brady_status text,
  ADD COLUMN IF NOT EXISTS decertified boolean DEFAULT false;

-- ── RLS policies (idempotent, matching existing Tier 9 pattern) ─────────────

ALTER TABLE officer_external_intel ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_sentencing_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE prosecution_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE exoneration_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE forensic_lab_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_source_freshness ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='officer_external_intel' AND policyname='service_all') THEN
    CREATE POLICY service_all ON officer_external_intel FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='judge_sentencing_patterns' AND policyname='service_all') THEN
    CREATE POLICY service_all ON judge_sentencing_patterns FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='prosecution_profiles' AND policyname='service_all') THEN
    CREATE POLICY service_all ON prosecution_profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='outcome_benchmarks' AND policyname='service_all') THEN
    CREATE POLICY service_all ON outcome_benchmarks FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exoneration_patterns' AND policyname='service_all') THEN
    CREATE POLICY service_all ON exoneration_patterns FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='forensic_lab_profiles' AND policyname='service_all') THEN
    CREATE POLICY service_all ON forensic_lab_profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='citation_authority' AND policyname='service_all') THEN
    CREATE POLICY service_all ON citation_authority FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='data_source_freshness' AND policyname='service_all') THEN
    CREATE POLICY service_all ON data_source_freshness FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
