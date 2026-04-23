-- Judge Fingerprint safety pass — Round 2 findings from worry-to-pristine.
-- Code-reviewer surfaced 1 CRITICAL + 3 WARNING after Round 1 fixes.
--
-- Findings addressed here (schema-level):
--   WARNING: jmor_min_cell was NOT VALID — historical rows unchecked
--   WARNING: methodology_url hardcoded to 404 URL — NULL it out until page ships
--   WARNING: Signal 5 rebuild was non-transactional (fixed in builder, not here)
--   CRITICAL: jackknife baseline collision-contamination (fixed in builder)

BEGIN;

-- ============================================================================
-- Round 2 WARNING: jmor_min_cell was added NOT VALID, so historical rows
-- with filed_count < 5 were never checked.  Delete offenders, then VALIDATE.
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='judge_motion_outcome_rates') THEN
    EXECUTE 'DELETE FROM public.judge_motion_outcome_rates WHERE filed_count < 5';
    -- Only VALIDATE if the NOT VALID constraint was actually added.
    IF EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname='judge_motion_outcome_rates' AND c.conname='jmor_min_cell' AND NOT c.convalidated
    ) THEN
      EXECUTE 'ALTER TABLE public.judge_motion_outcome_rates VALIDATE CONSTRAINT jmor_min_cell';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- Round 2 WARNING: methodology_url was hardcoded to a URL that 404s.  Better
-- to leave NULL than to link a 404 from publicly-served rows.  Render layer
-- will gate "How was this computed?" on IS NOT NULL.
-- ============================================================================
UPDATE public.judge_demographic_sentencing
   SET methodology_url = NULL
 WHERE methodology_url = 'https://imnotanattorney.com/methodology/judge-demographic-sentencing';

COMMIT;
