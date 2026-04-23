-- Judge Fingerprint safety fixes — Round 1 CRITICAL findings from worry-to-pristine loop.
-- Plan: docs/plans/2026-04-23-worry-judge-fingerprint-safety.md
--
-- Findings addressed:
--   1. Signal 5 surname collision (code-reviewer) — fix in builder, not SQL
--   2. Signal 4 threshold in INSERT (code-reviewer) — fix in builder, not SQL
--   3. Signal 3 disposition NULL (code-reviewer) — relax schema to reflect filings-only corpus
--   4. k-anon inadequate for race-stratified data (security-auditor, Sweeney 2013 l-diversity)
--   5. judge_motion_outcome_rates missing SELECT policy (security-auditor)
--   6. 93% uncanonicalized Signal 5 rows publicly served (security-auditor)

BEGIN;

-- ============================================================================
-- Finding 3: Signal 3 disposition schema honesty
-- ----------------------------------------------------------------------------
-- FJC dataset_source=4 is filings-only (no terminations loaded yet).
-- Schema currently requires NOT NULL on n_disposed/n_plea/n_trial/n_dismissed/n_convicted.
-- Relax + add consistency check so callers cannot read "0% conviction rate" as a real rate.
-- ============================================================================

ALTER TABLE public.judge_disposition_profile
  ALTER COLUMN n_disposed   DROP NOT NULL,
  ALTER COLUMN n_plea       DROP NOT NULL,
  ALTER COLUMN n_trial      DROP NOT NULL,
  ALTER COLUMN n_dismissed  DROP NOT NULL,
  ALTER COLUMN n_convicted  DROP NOT NULL;

ALTER TABLE public.judge_disposition_profile
  ADD COLUMN IF NOT EXISTS disposition_data_available BOOLEAN NOT NULL DEFAULT FALSE;

-- Consistency: if rates are non-null, their denominator must be non-null too.
ALTER TABLE public.judge_disposition_profile
  DROP CONSTRAINT IF EXISTS judge_disposition_profile_rate_denom;
ALTER TABLE public.judge_disposition_profile
  ADD CONSTRAINT judge_disposition_profile_rate_denom CHECK (
    (plea_rate       IS NULL OR n_disposed IS NOT NULL) AND
    (trial_rate      IS NULL OR n_disposed IS NOT NULL) AND
    (dismissal_rate  IS NULL OR n_disposed IS NOT NULL) AND
    (conviction_rate IS NULL OR n_disposed IS NOT NULL)
  );

COMMENT ON COLUMN public.judge_disposition_profile.disposition_data_available IS
  'FALSE = filings-only record (FJC dataset_source=4, no termination data loaded). TRUE = dispositions available. Product copy MUST gate rate-rendering on this column.';

-- ============================================================================
-- Finding 4: k-anonymity inadequate on race-stratified sentencing
-- ----------------------------------------------------------------------------
-- Sweeney 2013 + NIST l-diversity: k=5 is insufficient when data is stratified
-- by a sensitive attribute (race). Small districts + race slicing enable re-id.
-- Raise floor to 11 (conservative for race-stratified federal sentencing).
-- DELETE rows that no longer qualify.
-- ============================================================================

ALTER TABLE public.judge_demographic_sentencing
  DROP CONSTRAINT IF EXISTS jds_min_cell;

DELETE FROM public.judge_demographic_sentencing WHERE total_cases < 11;

ALTER TABLE public.judge_demographic_sentencing
  ADD CONSTRAINT jds_min_cell CHECK (total_cases >= 11);

COMMENT ON CONSTRAINT jds_min_cell ON public.judge_demographic_sentencing IS
  'k-anonymity floor raised from 5 to 11 per Sweeney 2013 / NIST l-diversity guidance for race-stratified sentencing data.';

-- ============================================================================
-- Finding 6: defamation exposure — 93% of Signal 5 rows lack canonical_id link
-- ----------------------------------------------------------------------------
-- Publicly serving name-only rows risks attaching sentencing pattern to wrong judge.
-- Gate the public-read policy on canonical_id IS NOT NULL.
-- Uncanonicalized rows remain in DB (service-role can still read for internal work)
-- but anon/authenticated see only identity-confirmed rows.
-- ============================================================================

DROP POLICY IF EXISTS jds_public_read ON public.judge_demographic_sentencing;
CREATE POLICY jds_public_read ON public.judge_demographic_sentencing
  FOR SELECT TO anon, authenticated
  USING (judge_canonical_id IS NOT NULL);

COMMENT ON POLICY jds_public_read ON public.judge_demographic_sentencing IS
  'Public reads restricted to canonically-linked judges to prevent defamation risk from name-match ambiguity. Uncanonicalized rows remain internal until fuzzy-match v4 ships.';

-- ============================================================================
-- Finding 5: judge_motion_outcome_rates missing SELECT policy
-- ----------------------------------------------------------------------------
-- Table had RLS enabled but no SELECT policy, causing anon SELECT to return
-- zero rows silently. Add explicit public-read policy + defense-in-depth REVOKE.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='judge_motion_outcome_rates') THEN
    EXECUTE 'ALTER TABLE public.judge_motion_outcome_rates ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS jmor_public_read ON public.judge_motion_outcome_rates';
    EXECUTE 'CREATE POLICY jmor_public_read ON public.judge_motion_outcome_rates FOR SELECT TO anon, authenticated USING (true)';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.judge_motion_outcome_rates FROM anon, authenticated';
  END IF;
END $$;

-- Add k-anonymity floor if not already present (defense-in-depth).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='judge_motion_outcome_rates')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='judge_motion_outcome_rates' AND column_name='filed_count')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema='public' AND table_name='judge_motion_outcome_rates' AND constraint_name='jmor_min_cell') THEN
    EXECUTE 'ALTER TABLE public.judge_motion_outcome_rates ADD CONSTRAINT jmor_min_cell CHECK (filed_count >= 5) NOT VALID';
  END IF;
END $$;

-- ============================================================================
-- Methodology transparency column
-- ----------------------------------------------------------------------------
-- Every publicly-served signal table must carry a methodology pointer so
-- product copy can link "How was this computed?" without fabricating wording.
-- ============================================================================

ALTER TABLE public.judge_demographic_sentencing
  ADD COLUMN IF NOT EXISTS methodology_url TEXT;

COMMENT ON COLUMN public.judge_demographic_sentencing.methodology_url IS
  'Link to published methodology doc explaining delta computation, k-anonymity, canonical-ID restriction.';

COMMIT;
