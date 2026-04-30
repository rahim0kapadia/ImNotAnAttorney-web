-- 20260429b_remove_legacy_e2e_test_orphans.sql
--
-- Cleanup migration — removes 15 legacy E2E test stub `cases` rows + their
-- linked `orders` rows that predate the cleanup-e2e-orphans cron's filter
-- pattern (`phase2-e2e-%@test.invalid`).
--
-- Why these slipped through:
--   - The /api/cron/cleanup-e2e-orphans route filters on
--     `email LIKE 'phase2-e2e-%@test.invalid'` (Phase 2 Playwright spec
--     convention).
--   - These 15 rows used the older `test@imnotanattorney.com` and
--     `test+<tier>-<timestamp>@imnotanattorney.com` patterns from earlier
--     E2E runs. The cron's narrow filter never matched them.
--   - All have `report_html` containing the literal string "E2E Test Report"
--     and "E2E Pipeline Verification" — unambiguously test artifacts.
--   - All have `length(report_html) < 500` (real reports are 50KB+).
--   - Date range: 2026-03-16 through 2026-03-27.
--
-- Why remove now:
--   - Pristine launch posture: production DB must contain ONLY real
--     customer rows. Test-stub rows in `cases` skew analytics, leak into
--     admin dashboards, and risk customer-support confusion ("delivered"
--     status with stub HTML).
--   - Same posture as 20260429a (FIXTURE-* removal): unambiguous test data
--     with safe identifying patterns + already deleted in single tx with
--     Rahim approval; this migration captures the cleanup for any future
--     DB rebuild.
--
-- Triple-filter for safety:
--   1. report_html LIKE '%E2E Test Report%'
--   2. report_html LIKE '%E2E Pipeline Verification%'
--   3. length(report_html) < 500
--   4. Linked order email is test@imnotanattorney.com OR
--      test+%@imnotanattorney.com
--
-- Idempotent: re-running on an already-cleaned DB is a no-op.
--
-- Reversibility: NONE — these were test stubs with no real customer data.
-- If a real customer ever uses literally test@imnotanattorney.com as their
-- intake email, the four-condition filter (HTML must contain literal "E2E
-- Test Report" + "E2E Pipeline Verification" + < 500 bytes) protects them.

-- Cases first (FK reverse order vs orders).
DELETE FROM public.cases c
 USING public.orders o
 WHERE c.order_id = o.id
   AND c.report_html LIKE '%E2E Test Report%'
   AND c.report_html LIKE '%E2E Pipeline Verification%'
   AND length(c.report_html) < 500
   AND (o.email = 'test@imnotanattorney.com'
        OR o.email LIKE 'test+%@imnotanattorney.com');

DELETE FROM public.orders
 WHERE id IN (
   SELECT order_id FROM public.cases  -- already-deleted cases referenced here would be empty
   WHERE report_html LIKE '%E2E Test Report%'
 )
 OR (
   email LIKE 'test+%@imnotanattorney.com'
   AND tier IN ('intelligence-brief', 'war-room', 'x-ray', 'situation-room')
   AND created_at < '2026-04-01'
   AND id NOT IN (SELECT order_id FROM public.cases WHERE order_id IS NOT NULL)
 );
