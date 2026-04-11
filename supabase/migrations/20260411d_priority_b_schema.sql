-- 20260411d_priority_b_schema.sql
-- Priority B: Critical 7 Worker Builds — per-case output tables + cross-case corpus extensions
-- Spec: docs/superpowers/specs/2026-04-09-hybrid-stacking-cascade-design.md

-- ============================================================
-- PER-CASE OUTPUT TABLES (one analysis per case per worker)
-- ============================================================

-- B1: Plea Deal Analyzer output
CREATE TABLE plea_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  plea_offer_summary text NOT NULL,
  charge_comparison jsonb NOT NULL DEFAULT '{}',
  guideline_analysis jsonb NOT NULL DEFAULT '{}',
  departure_arguments jsonb DEFAULT '[]',
  leverage_points jsonb DEFAULT '[]',
  risk_assessment jsonb NOT NULL DEFAULT '{}',
  hidden_consequences jsonb DEFAULT '[]',
  recommendation_factors jsonb DEFAULT '[]',
  overall_assessment text NOT NULL,
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX idx_plea_analyses_case ON plea_analyses(case_id);
ALTER TABLE plea_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON plea_analyses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- B2: ACH Matrix output
CREATE TABLE ach_matrices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  hypotheses jsonb NOT NULL DEFAULT '[]',
  evidence_items jsonb NOT NULL DEFAULT '[]',
  scores jsonb NOT NULL DEFAULT '[]',
  rankings jsonb NOT NULL DEFAULT '[]',
  prosecution_strongest text,
  defense_opportunities jsonb DEFAULT '[]',
  diagnosticity_notes text,
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX idx_ach_matrices_case ON ach_matrices(case_id);
ALTER TABLE ach_matrices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON ach_matrices FOR ALL TO service_role USING (true) WITH CHECK (true);

-- B3: Adversarial Prosecution Simulator output (multiple rounds per strategy)
CREATE TABLE adversarial_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  defense_strategy_id text NOT NULL,
  defense_strategy_label text,
  round_number integer NOT NULL DEFAULT 1,
  prosecution_move text NOT NULL,
  prosecution_case_law text,
  prosecution_strength text NOT NULL CHECK (prosecution_strength IN ('STRONG', 'MEDIUM', 'WEAK')),
  defense_response text NOT NULL,
  defense_case_law text,
  convergence_reached boolean DEFAULT false,
  winner text CHECK (winner IN ('prosecution', 'defense', 'draw')),
  key_vulnerability text,
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_adversarial_rounds_case ON adversarial_rounds(case_id);
CREATE INDEX idx_adversarial_rounds_strategy ON adversarial_rounds(case_id, defense_strategy_id);
ALTER TABLE adversarial_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON adversarial_rounds FOR ALL TO service_role USING (true) WITH CHECK (true);

-- B4: Sentencing Intelligence output
CREATE TABLE sentencing_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  judge_sentencing_profile jsonb NOT NULL DEFAULT '{}',
  guideline_range jsonb NOT NULL DEFAULT '{}',
  departure_analysis jsonb DEFAULT '[]',
  comparable_sentences jsonb DEFAULT '[]',
  aggravating_factors jsonb DEFAULT '[]',
  mitigating_factors jsonb DEFAULT '[]',
  plea_vs_trial_comparison jsonb NOT NULL DEFAULT '{}',
  sentencing_recommendation_factors jsonb DEFAULT '[]',
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX idx_sentencing_analyses_case ON sentencing_analyses(case_id);
ALTER TABLE sentencing_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON sentencing_analyses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- B5: Daubert / Expert Witness Challenge output (one per expert per case)
CREATE TABLE expert_witness_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  witness_name text NOT NULL,
  witness_type text NOT NULL,
  methodology_used text,
  daubert_factors jsonb NOT NULL DEFAULT '{}',
  challenge_opportunities jsonb DEFAULT '[]',
  prior_testimony_issues jsonb DEFAULT '[]',
  cross_exam_questions jsonb DEFAULT '[]',
  motion_in_limine_basis text,
  overall_vulnerability text NOT NULL CHECK (overall_vulnerability IN ('high', 'medium', 'low')),
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_expert_challenges_case ON expert_witness_challenges(case_id);
ALTER TABLE expert_witness_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON expert_witness_challenges FOR ALL TO service_role USING (true) WITH CHECK (true);

-- B6: Media Transcripts (body cam, dashcam, interview recordings, etc.)
CREATE TABLE media_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  document_id uuid REFERENCES discovery_documents(id),
  media_type text NOT NULL CHECK (media_type IN ('bodycam', 'dashcam', 'interview', 'phone_call', 'surveillance', 'other')),
  transcript_text text NOT NULL,
  duration_seconds integer,
  speaker_labels jsonb DEFAULT '[]',
  annotations jsonb DEFAULT '[]',
  miranda_detected boolean DEFAULT false,
  miranda_timestamp text,
  keywords_flagged jsonb DEFAULT '[]',
  defense_relevant_segments jsonb DEFAULT '[]',
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_media_transcripts_case ON media_transcripts(case_id);
CREATE INDEX idx_media_transcripts_document ON media_transcripts(document_id);
ALTER TABLE media_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON media_transcripts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- CROSS-CASE CORPUS TABLES (no per-case FK — institutional knowledge)
-- Extends existing Tier 9 tables (sentencing_distributions, plea_discount_curves, etc.)
-- ============================================================

-- Cross-case prosecution tactic patterns (fed by B3 Adversarial Sim)
CREATE TABLE cross_case_prosecution_tactics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction text NOT NULL,
  charge_slug text NOT NULL,
  defense_strategy_type text NOT NULL,
  prosecution_counter_type text NOT NULL,
  counter_effectiveness numeric(5,2),
  defense_rebuttal_effectiveness numeric(5,2),
  round_count integer DEFAULT 1,
  sample_size integer DEFAULT 1,
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cross_case_prosecution_tactics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON cross_case_prosecution_tactics FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Cross-case expert witness profiles (fed by B5 Daubert)
CREATE TABLE cross_case_expert_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_name text NOT NULL,
  expert_type text NOT NULL,
  jurisdiction text,
  methodology text,
  challenge_type text,
  known_weaknesses jsonb DEFAULT '[]',
  prior_testimony_contradictions jsonb DEFAULT '[]',
  sample_size integer DEFAULT 1,
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cross_case_expert_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON cross_case_expert_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Cross-case hypothesis outcome patterns (fed by B2 ACH)
CREATE TABLE cross_case_hypothesis_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_slug text NOT NULL,
  jurisdiction text,
  hypothesis_type text NOT NULL,
  evidence_pattern text NOT NULL,
  outcome text CHECK (outcome IN ('validated', 'invalidated', 'inconclusive')),
  frequency_pct numeric(5,2),
  sample_size integer DEFAULT 1,
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cross_case_hypothesis_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON cross_case_hypothesis_patterns FOR ALL TO service_role USING (true) WITH CHECK (true);
