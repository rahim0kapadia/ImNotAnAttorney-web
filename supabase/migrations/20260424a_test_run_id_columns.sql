-- 20260424a_test_run_id_columns.sql
--
-- Adds nullable `test_run_id uuid` column + partial index
--   `WHERE test_run_id IS NOT NULL`
-- to the eight in-scope tables that test scripts (and CV probes)
-- intersect with. Enables the Brandur Leach marker-path pattern for
-- non-transactional surfaces (route handlers owning their own pool)
-- where transactional rollback in the test client cannot reach the
-- API-side inserts.
--
-- Why nullable + partial: backfill cost is zero, probe queries
-- filtering `IS NULL` never touch the partial index, reaper
-- queries filtering `test_run_id = $1` use it for O(log N) lookup.
--
-- Idempotent via IF NOT EXISTS on both ADD COLUMN and CREATE INDEX.
-- Re-applying is a safe no-op.
--
-- Companion helpers: scripts/lib/test-db.mjs, scripts/lib/reap-test-runs.mjs.
-- Companion rule: ~/.claude/rules/drafts/test-isolation.md.
-- Companion plan: docs/plans/2026-04-24-worry-test-pollution-cv.md (T0).
-- Expert citation: ~/.claude/experts/brandur-leach.md.

BEGIN;

ALTER TABLE orders          ADD COLUMN IF NOT EXISTS test_run_id uuid;
ALTER TABLE cases           ADD COLUMN IF NOT EXISTS test_run_id uuid;
ALTER TABLE intakes         ADD COLUMN IF NOT EXISTS test_run_id uuid;
ALTER TABLE subscribers     ADD COLUMN IF NOT EXISTS test_run_id uuid;
ALTER TABLE drip_emails     ADD COLUMN IF NOT EXISTS test_run_id uuid;
ALTER TABLE operator_tasks  ADD COLUMN IF NOT EXISTS test_run_id uuid;
ALTER TABLE case_findings   ADD COLUMN IF NOT EXISTS test_run_id uuid;
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS test_run_id uuid;

CREATE INDEX IF NOT EXISTS idx_orders_test_run_id
  ON orders          (test_run_id) WHERE test_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cases_test_run_id
  ON cases           (test_run_id) WHERE test_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_intakes_test_run_id
  ON intakes         (test_run_id) WHERE test_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscribers_test_run_id
  ON subscribers     (test_run_id) WHERE test_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drip_emails_test_run_id
  ON drip_emails     (test_run_id) WHERE test_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operator_tasks_test_run_id
  ON operator_tasks  (test_run_id) WHERE test_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_findings_test_run_id
  ON case_findings   (test_run_id) WHERE test_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_processing_jobs_test_run_id
  ON processing_jobs (test_run_id) WHERE test_run_id IS NOT NULL;

COMMIT;
