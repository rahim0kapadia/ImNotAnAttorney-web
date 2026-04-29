-- 20260429a_remove_attorney_discipline_test_fixtures.sql
--
-- Cleanup migration — removes the FIXTURE-* test rows seeded by
-- 20260425b_attorney_discipline_test_fixtures.sql for Phase 5 wire-up
-- E2E testing.
--
-- Why remove now:
--   - Wire-up shipped 2026-04-27 (PR #152).
--   - Fixture rows are clearly labeled `bar_number LIKE 'FIXTURE-%'` and the
--     original migration documented this exact cleanup pattern in its
--     COMMENT ON COLUMN.
--   - Pristine launch posture: production DB must contain ONLY real bar
--     records. example.com source URLs in prod fail the
--     `no-hallucinated-legal-data.md` audit (every legal-data row must point
--     to a verifiable .gov / official source).
--   - Tests that reference these names live in `__tests__/*.test.ts` and use
--     unit-test fixtures (fixtures.ts) — they do NOT depend on these prod rows.
--
-- Idempotent: re-running this migration on an already-cleaned DB is a no-op.
--
-- Reversibility: re-applying 20260425b will re-seed if ever needed for a
-- staging-only test pass. Production should never need that path again.

DELETE FROM public.attorney_discipline_events
 WHERE bar_number LIKE 'FIXTURE-%';

DELETE FROM public.attorneys
 WHERE bar_number LIKE 'FIXTURE-%';

-- Update the COMMENT to reflect that fixture seeding is no longer the
-- intended state in production.
COMMENT ON COLUMN public.attorneys.bar_number IS
  'Bar number issued by the attorney''s licensing jurisdiction. Production
   data only — synthetic FIXTURE-* rows seeded by 20260425b were removed by
   20260429a after Phase 5 wire-up shipped (PR #152). Tests use in-memory
   fixtures from supabase/functions/generate-report/__tests__/fixtures.ts.';
