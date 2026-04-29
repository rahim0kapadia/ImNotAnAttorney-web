-- 20260425b_attorney_discipline_test_fixtures.sql
--
-- ⚠ STAGING / LOCAL DEV ONLY — DO NOT RE-APPLY TO PRODUCTION ⚠
--
-- These fixture rows use `https://example.com/...` source URLs, which
-- violate `~/.claude/rules/no-hallucinated-legal-data.md` ("every legal-data
-- row MUST have a verifiable HTTPS source_url anchored to a .gov / official
-- source"). They were a Phase 5 E2E testing aid only.
--
-- Production removed these rows via 20260429a (2026-04-29). Reapplying THIS
-- migration to prod would silently reintroduce the no-hallucinated-legal-data
-- violation. If you need a fixture-seeded DB for testing:
--   - Local Supabase / Docker: applying both migrations in order leaves
--     20260429a's cleanup as the final state — no fixtures reach the running
--     test DB. Inline seeding in test setup is preferred (see
--     supabase/functions/__tests__/rls-attorney-discipline.test.ts STALE notice).
--   - Staging: same as above; consider replacing the example.com URLs below
--     with valid placeholder paths under a non-public-facing domain.
--
-- T1.3 (worry-attorney-discipline-wire v2.4):
-- Synthetic CLEAN-only fixture rows for end-to-end testing of the
-- attorney-discipline IB section. Three attorneys + two events, all
-- non-hostile.
--
-- Sec v3 CRITICAL #2: NEVER seed hostile values (`<script>`, `javascript:`,
-- pipe-shred) into the prod DB. Hostile-input testing is done in-memory at
-- test time, passing hostile values directly to renderAttorneyDisciplineSection
-- without any DB round-trip. See `supabase/functions/generate-report/__tests__/
-- attorney-discipline-upl.test.ts` (T3.1).
--
-- Migration role: applied as `postgres` superuser via Supabase Mgmt API.
-- `postgres` BYPASSES RLS — INSERT succeeds even though T0a enabled RLS on
-- both tables.
--
-- Idempotent: ON CONFLICT DO NOTHING on the unique keys
-- (jurisdiction, bar_number) for attorneys and
-- (jurisdiction, bar_number, order_date, discipline_type) for events.
--
-- Cleanup-friendly: bar_number prefix `FIXTURE-` lets future maintenance run
-- `DELETE FROM attorneys WHERE bar_number LIKE 'FIXTURE-%'` cleanly.

INSERT INTO public.attorneys
  (jurisdiction, bar_number, full_name,           first_name, last_name,    admission_date, current_status, last_seen_at)
VALUES
  ('CA',         'FIXTURE-001', 'Fixture Cleanrecord', 'Fixture',  'Cleanrecord', DATE '2010-01-15', 'active',    TIMESTAMPTZ '2026-04-25T00:00:00Z'),
  ('CA',         'FIXTURE-002', 'Fixture Disciplined', 'Fixture',  'Disciplined', DATE '2005-06-20', 'suspended', TIMESTAMPTZ '2026-04-25T00:00:00Z'),
  ('CA',         'FIXTURE-003', 'Fixture Cleanrecord', 'Fixture',  'Cleanrecord', DATE '2012-09-10', 'active',    TIMESTAMPTZ '2026-04-25T00:00:00Z')
ON CONFLICT (jurisdiction, bar_number) DO NOTHING;

-- Two events, both attached to FIXTURE-002 (the disciplined attorney).
INSERT INTO public.attorney_discipline_events
  (attorney_id, jurisdiction, bar_number, full_name, order_date, discipline_type, discipline_raw, violation_summary, order_url, source_url, scraped_at)
SELECT a.id, 'CA', a.bar_number, a.full_name, e.order_date, e.discipline_type, e.discipline_raw, e.violation_summary, e.order_url, e.source_url, TIMESTAMPTZ '2026-04-25T00:00:00Z'
FROM public.attorneys a
CROSS JOIN LATERAL (VALUES
  ('FIXTURE-002', DATE '2018-03-12', 'Suspension', 'SUSPENSION 90D STAYED', '90-day suspension stayed', 'https://example.com/fixture-002-evt-1', 'https://example.com/fixture-002-source'),
  ('FIXTURE-002', DATE '2020-07-01', 'Probation',  'PROBATION 1Y',          '1-year probation imposed', 'https://example.com/fixture-002-evt-2', 'https://example.com/fixture-002-source')
) AS e(bar, order_date, discipline_type, discipline_raw, violation_summary, order_url, source_url)
WHERE a.jurisdiction = 'CA' AND a.bar_number = e.bar
ON CONFLICT (jurisdiction, bar_number, order_date, discipline_type) DO NOTHING;

COMMENT ON COLUMN public.attorneys.bar_number IS
  'Bar number. Synthetic fixtures use prefix `FIXTURE-` to enable cleanup via
   `DELETE FROM attorneys WHERE bar_number LIKE ''FIXTURE-%''`. See
   worry-attorney-discipline-wire plan T1.3, 2026-04-25.';
