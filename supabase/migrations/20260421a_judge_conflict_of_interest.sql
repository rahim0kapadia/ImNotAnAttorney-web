-- Judge Conflict-of-Interest table
-- Surfaces (judge, case, company) conflicts where judge holds investment in a company
-- that is a party in a case. Powers Judge Report Card ($197) "Recusal Grounds" section
-- and X-Ray ($2,497) Judge Intelligence Profile.
--
-- Source tables (all local):
--   cl_disclosure_investments (1.9M rows — CL bulk financial-disclosure-investments)
--   cl_financial_disclosures  (32K — CL bulk financial-disclosures)
--   cl_people                 (16K — CL bulk people)
--   entities_judges           (20K — canonical judge layer, FK via cl_person_id)
--   entities_cases            (7.8M — canonical case layer, party extracted from case_name)
--
-- Every row carries disclosure_url + case_url for safety-critical verification
-- (per no-hallucinated-legal-data rule).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.judge_conflict_of_interest (
  id BIGSERIAL PRIMARY KEY,
  judge_canonical_id UUID NOT NULL REFERENCES public.entities_judges(canonical_id) ON DELETE CASCADE,
  judge_name TEXT NOT NULL,
  case_canonical_id UUID REFERENCES public.entities_cases(canonical_id) ON DELETE SET NULL,
  case_name TEXT,
  investment_id BIGINT REFERENCES public.cl_disclosure_investments(id) ON DELETE SET NULL,
  company_holding TEXT NOT NULL,
  holding_value_code TEXT,                    -- CL bracket code (J/K/L/M/...)
  holding_value_estimate TEXT,                -- human "$15,001-$50,000"
  holding_description TEXT NOT NULL,          -- raw description
  match_confidence REAL NOT NULL,             -- 0.0-1.0 trigram similarity on normalized names
  match_type TEXT NOT NULL CHECK (match_type IN ('exact','fuzzy','subsidiary','inferred')),
  disclosure_id BIGINT,
  disclosure_year SMALLINT,
  disclosure_url TEXT,                        -- https://www.courtlistener.com/financial-disclosures/<id>/
  case_court TEXT,
  case_year SMALLINT,
  case_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (judge_canonical_id, case_canonical_id, investment_id)
);

CREATE INDEX IF NOT EXISTS idx_jcoi_judge ON public.judge_conflict_of_interest (judge_canonical_id);
CREATE INDEX IF NOT EXISTS idx_jcoi_case ON public.judge_conflict_of_interest (case_canonical_id);
CREATE INDEX IF NOT EXISTS idx_jcoi_confidence ON public.judge_conflict_of_interest (match_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_jcoi_type ON public.judge_conflict_of_interest (match_type);
CREATE INDEX IF NOT EXISTS idx_jcoi_company ON public.judge_conflict_of_interest USING gin (company_holding gin_trgm_ops);

COMMENT ON TABLE public.judge_conflict_of_interest IS
  'Judge recusal-ground surface — (judge, case, company) triples where a judge holds a disclosed investment in a company that appears as a case party. Populated by scripts/build-judge-coi.mjs from CL financial disclosures + entities_cases party extraction. Every row has disclosure_url + case_url for verification. Powers $197 Judge Report Card Recusal Grounds + $2,497 X-Ray Judge Profile.';
