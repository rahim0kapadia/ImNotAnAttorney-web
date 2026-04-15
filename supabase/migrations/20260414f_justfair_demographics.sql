-- JUSTFAIR Demographics — judge biographical + defendant-race sentencing disparity tables
-- Source: JUSTFAIR (Federal Judicial Sentencing To Advance Inclusivity and Reduce Disparities)
-- OSF: https://osf.io/nseh5/
-- 595,851 federal sentencing records, FY2001-FY2018

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS judge_demographics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_name text NOT NULL,
  judge_name_normalized text NOT NULL,
  district text,
  gender text,
  race_ethnicity text,
  appointing_president text,
  appointing_party text,
  aba_rating text,
  birth_year integer,
  law_school text,
  senior_status_date text,
  active_start integer,
  active_end integer,
  source_urls text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE (judge_name_normalized, district)
);

CREATE INDEX IF NOT EXISTS idx_judge_demo_name ON judge_demographics
  USING gin (judge_name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_judge_demo_district ON judge_demographics (district);
CREATE INDEX IF NOT EXISTS idx_judge_demo_party ON judge_demographics (appointing_party);

CREATE TABLE IF NOT EXISTS judge_sentencing_demographics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_name_normalized text NOT NULL,
  district text NOT NULL,
  defendant_race text NOT NULL,
  total_cases integer DEFAULT 0,
  median_sentence_months numeric,
  mean_sentence_months numeric,
  guideline_departure_rate numeric,
  avg_departure_pct numeric,
  source_urls text[] NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE (judge_name_normalized, district, defendant_race)
);

CREATE INDEX IF NOT EXISTS idx_judge_sent_demo_name ON judge_sentencing_demographics
  USING gin (judge_name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_judge_sent_demo_district ON judge_sentencing_demographics (district);
CREATE INDEX IF NOT EXISTS idx_judge_sent_demo_race ON judge_sentencing_demographics (defendant_race);

ALTER TABLE sentencing_distributions ADD COLUMN IF NOT EXISTS mean_months numeric;
ALTER TABLE sentencing_distributions ADD COLUMN IF NOT EXISTS p10 numeric;
ALTER TABLE sentencing_distributions ADD COLUMN IF NOT EXISTS p90 numeric;
ALTER TABLE sentencing_distributions ADD COLUMN IF NOT EXISTS sources text[] DEFAULT '{}'::text[];

ALTER TABLE judge_demographics ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_sentencing_demographics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='judge_demographics' AND policyname='service_all') THEN
    CREATE POLICY service_all ON judge_demographics FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='judge_sentencing_demographics' AND policyname='service_all') THEN
    CREATE POLICY service_all ON judge_sentencing_demographics FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;