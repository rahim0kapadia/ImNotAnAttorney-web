-- ============================================================================
-- Migration: 20260503b_dedup_md_ut_hi_statutes.sql
-- Purpose:   Remove duplicate-title-tag rows from MD and UT that were
--            introduced by double-ingest during the Wave 2 statute rollout.
--            HI scope expansion (Chapter 134 Firearms) is explicitly retained.
--
-- ORDERING: Apply AFTER PRs #264 (MD), #266 (UT), and #269 (HI) are all
--           merged to master. Those PRs seeded the canonical rows; this
--           migration removes the duplicate-tagged rows from earlier runs.
--
-- DO NOT APPLY to prod until the three feeder PRs are merged.
--
-- ============================================================================
-- PRE-FLIGHT VERIFICATION
-- Run these SELECTs before applying and confirm counts match expectations.
-- ============================================================================
--
-- MD — expect two title groups (~864 'cr', ~861 'Article 2:')
--   SELECT title, COUNT(*) FROM entities_statutes
--   WHERE jurisdiction = 'MD' GROUP BY title ORDER BY title;
--
-- UT — expect two title groups (~638 '76', ~638 'cr')
--   SELECT title, COUNT(*) FROM entities_statutes
--   WHERE jurisdiction = 'UT' GROUP BY title ORDER BY title;
--
-- HI — expect chapters 701-712A (Title 37 Penal Code) + chapter 134 (Firearms)
--   SELECT title, COUNT(*) FROM entities_statutes
--   WHERE jurisdiction = 'HI'
--   GROUP BY title
--   ORDER BY CASE WHEN title ~ '^\d+$' THEN title::int ELSE 9999 END, title;
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: MD — Remove wrong-title-tag rows
-- ============================================================================
-- Context:   PR #264 double-ingest: sibling run used title='Article 2:' while
--            the canonical md-cr seeder (ARTICLE constant, line 55) uses 'cr'.
-- Keep:      title='cr'         (~864 rows — canonical tag)
-- Delete:    title='Article 2:' (~861 rows — sibling-run artifact)
-- Expected DELETE count: ~861 rows

DELETE FROM entities_statutes
WHERE jurisdiction = 'MD'
  AND title = 'Article 2:';

-- Post-state: should show exactly one group: title='cr', count=~864
-- SELECT title, COUNT(*) FROM entities_statutes WHERE jurisdiction = 'MD' GROUP BY title;

-- ============================================================================
-- SECTION 2: UT — Remove wrong-title-tag rows
-- ============================================================================
-- Context:   PR #266 seeder had TITLE constant set to 'cr' before commit
--            767f3513 fixed it to '76'. An earlier run inserted title='cr'
--            rows; the corrected seeder inserted title='76' rows (canonical
--            per Wave 2 convention: titleNum = title number = '76').
-- Keep:      title='76'  (~638 rows — canonical Wave 2 convention)
-- Delete:    title='cr'  (~638 rows — pre-fix seeder artifact)
-- Expected DELETE count: ~638 rows

DELETE FROM entities_statutes
WHERE jurisdiction = 'UT'
  AND title = 'cr';

-- Post-state: should show exactly one group: title='76', count=~638
-- SELECT title, COUNT(*) FROM entities_statutes WHERE jurisdiction = 'UT' GROUP BY title;

-- ============================================================================
-- SECTION 3: HI — No delete (dual-scope is intentional)
-- ============================================================================
-- Context:   PR #269 seeded 958 rows:
--              - Title 37 Penal Code chapters 701-712A (~585 rows,
--                titleNum = chapter number e.g. '701', '707', etc.)
--              - Chapter 134 Firearms (~373 rows, title='134')
-- Decision:  KEEP both scopes. Chapter 134 (Firearms offenses under HRS
--            Title 10) is directly relevant to criminal defense cases in
--            Hawaii and was explicitly included by the seeder. Defense
--            lawyers working HI cases need both the Penal Code chapters
--            AND the Firearms chapter. The 958-row total is correct.
--            No rows are removed for HI.
-- ============================================================================
-- (intentional no-op for HI)

-- ============================================================================
-- POST-MIGRATION TOTALS
-- ============================================================================
-- Run after applying to verify final state:
--   SELECT jurisdiction, COUNT(*) AS total_rows
--   FROM entities_statutes
--   WHERE jurisdiction IN ('MD', 'UT', 'HI')
--   GROUP BY jurisdiction ORDER BY jurisdiction;
--
-- Expected:
--   MD  ~864   (only title='cr' rows remain)
--   UT  ~638   (only title='76' rows remain)
--   HI  ~958   (all rows retained — dual-scope intentional)

COMMIT;
