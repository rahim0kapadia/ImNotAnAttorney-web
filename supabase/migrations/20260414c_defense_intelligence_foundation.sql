-- Defense Intelligence Foundation — Phase 0A/0B tables
-- Applied via Management API. See: docs/superpowers/plans/2026-04-13-defense-intelligence-foundation.md
-- Tables: charge_defense_theories, classified_opinions, pipeline_accuracy_log, defense_theory_outcomes, motion_success_patterns

-- 1. charge_defense_theories — constrained mapping: charge → theory → keywords + motions
CREATE TABLE IF NOT EXISTS charge_defense_theories (
  charge_slug text NOT NULL,
  theory_name text NOT NULL,
  theory_keywords text[] NOT NULL DEFAULT '{}',
  motion_types text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (charge_slug, theory_name)
);

-- 2. classified_opinions — purpose-built, verification-first opinion corpus
CREATE TABLE IF NOT EXISTS classified_opinions (
  cluster_id text PRIMARY KEY,
  case_name text NOT NULL,
  court text NOT NULL,
  jurisdiction text NOT NULL,
  decision_date date,
  opinion_type text NOT NULL DEFAULT 'full',
  charge_types text[] NOT NULL DEFAULT '{}',
  motion_types text[] NOT NULL DEFAULT '{}',
  defense_theories text[] NOT NULL DEFAULT '{}',
  motion_outcomes jsonb,
  motion_favorability jsonb,
  case_favorability integer,
  holding_text text,
  authority_score integer,
  is_good_law boolean DEFAULT true,
  citing_count integer DEFAULT 0,
  classification_confidence text NOT NULL DEFAULT 'verified',
  cross_validation_signals jsonb,
  classified_at timestamptz DEFAULT now(),
  classified_by text DEFAULT 'mechanical_pipeline',
  source_urls text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_classified_opinions_jurisdiction ON classified_opinions(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_classified_opinions_opinion_type ON classified_opinions(opinion_type);
CREATE INDEX IF NOT EXISTS idx_classified_opinions_confidence ON classified_opinions(classification_confidence);
CREATE INDEX IF NOT EXISTS idx_classified_opinions_charge_types ON classified_opinions USING GIN(charge_types);
CREATE INDEX IF NOT EXISTS idx_classified_opinions_motion_types ON classified_opinions USING GIN(motion_types);
CREATE INDEX IF NOT EXISTS idx_classified_opinions_defense_theories ON classified_opinions USING GIN(defense_theories);

-- 3. pipeline_accuracy_log — tracks extraction accuracy over time
CREATE TABLE IF NOT EXISTS pipeline_accuracy_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_date date NOT NULL,
  evaluation_type text NOT NULL,
  sample_size integer NOT NULL,
  per_field_accuracy jsonb,
  overall_accuracy numeric,
  flagged_fields text[],
  notes text,
  evaluated_by text,
  created_at timestamptz DEFAULT now()
);

-- 4. defense_theory_outcomes — pre-computed: charge x theory x jurisdiction
CREATE TABLE IF NOT EXISTS defense_theory_outcomes (
  charge_slug text NOT NULL,
  defense_theory text NOT NULL,
  jurisdiction text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  successes integer NOT NULL DEFAULT 0,
  motion_success_rate numeric,
  case_success_rate numeric,
  avg_sentence_reduction_pct numeric,
  best_combined_motion text,
  sample_source_urls text[] NOT NULL DEFAULT '{}',
  data_source_note text DEFAULT 'Published court opinions (appellate and district). Rates may differ from unpublished dispositions and plea agreements, which are not included in this dataset.',
  computed_at timestamptz DEFAULT now(),
  CONSTRAINT defense_theory_outcomes_pk UNIQUE (charge_slug, defense_theory, jurisdiction)
);

-- 5. motion_success_patterns — pre-computed: motion x charge x jurisdiction x judge
CREATE TABLE IF NOT EXISTS motion_success_patterns (
  motion_type text NOT NULL,
  charge_slug text NOT NULL,
  jurisdiction text NOT NULL,
  judge_id uuid,
  filed_count integer NOT NULL DEFAULT 0,
  granted_count integer NOT NULL DEFAULT 0,
  denied_count integer NOT NULL DEFAULT 0,
  grant_rate numeric,
  avg_days_to_ruling numeric,
  most_cited_opinion_id text,
  sample_source_urls text[] NOT NULL DEFAULT '{}',
  data_source_note text DEFAULT 'Published court opinions (appellate and district). Rates may differ from unpublished dispositions and plea agreements, which are not included in this dataset.',
  computed_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS motion_success_patterns_pk
  ON motion_success_patterns (motion_type, charge_slug, jurisdiction, COALESCE(judge_id::text, '__null__'));

-- RLS — service_role only for all new tables
ALTER TABLE charge_defense_theories ENABLE ROW LEVEL SECURITY;
ALTER TABLE classified_opinions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_accuracy_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE defense_theory_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE motion_success_patterns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'charge_defense_theories' AND policyname = 'service_role_full_charge_defense_theories') THEN
    CREATE POLICY service_role_full_charge_defense_theories ON charge_defense_theories FOR ALL TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'classified_opinions' AND policyname = 'service_role_full_classified_opinions') THEN
    CREATE POLICY service_role_full_classified_opinions ON classified_opinions FOR ALL TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pipeline_accuracy_log' AND policyname = 'service_role_full_pipeline_accuracy_log') THEN
    CREATE POLICY service_role_full_pipeline_accuracy_log ON pipeline_accuracy_log FOR ALL TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'defense_theory_outcomes' AND policyname = 'service_role_full_defense_theory_outcomes') THEN
    CREATE POLICY service_role_full_defense_theory_outcomes ON defense_theory_outcomes FOR ALL TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'motion_success_patterns' AND policyname = 'service_role_full_motion_success_patterns') THEN
    CREATE POLICY service_role_full_motion_success_patterns ON motion_success_patterns FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- Deny anon
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'charge_defense_theories' AND policyname = 'anon_no_access_charge_defense_theories') THEN
    CREATE POLICY anon_no_access_charge_defense_theories ON charge_defense_theories FOR ALL TO anon USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'classified_opinions' AND policyname = 'anon_no_access_classified_opinions') THEN
    CREATE POLICY anon_no_access_classified_opinions ON classified_opinions FOR ALL TO anon USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pipeline_accuracy_log' AND policyname = 'anon_no_access_pipeline_accuracy_log') THEN
    CREATE POLICY anon_no_access_pipeline_accuracy_log ON pipeline_accuracy_log FOR ALL TO anon USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'defense_theory_outcomes' AND policyname = 'anon_no_access_defense_theory_outcomes') THEN
    CREATE POLICY anon_no_access_defense_theory_outcomes ON defense_theory_outcomes FOR ALL TO anon USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'motion_success_patterns' AND policyname = 'anon_no_access_motion_success_patterns') THEN
    CREATE POLICY anon_no_access_motion_success_patterns ON motion_success_patterns FOR ALL TO anon USING (false);
  END IF;
END $$;
