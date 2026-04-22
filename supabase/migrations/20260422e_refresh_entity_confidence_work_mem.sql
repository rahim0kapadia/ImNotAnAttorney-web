-- Round-2 finding W8: the `refresh_entity_confidence_mv()` plpgsql wrapper
-- inherits default work_mem (3.5MB on Supabase). REFRESH MATERIALIZED VIEW
-- CONCURRENTLY runs a SORT op under the hood and will spill to disk at that
-- size, blowing the nightly refresh window.
--
-- Fix: ALTER the function to SET LOCAL work_mem=128MB at the top of the body.
-- Tier-sized for Supabase Medium (4GB RAM) per ~/.claude/rules/cl-bulk-data-
-- defensive.md (`work_mem ≤ RAM/16` → 4GB/16 = 256MB ceiling; 128MB is a
-- conservative pick that still gives a ~36× lift over the default).
--
-- NOT `maintenance_work_mem` — that's CREATE INDEX / VACUUM only. REFRESH
-- MATERIALIZED VIEW is a SORT op; it wants `work_mem`.
--
-- SET LOCAL scopes the change to this function invocation only — never leaks
-- to the surrounding session after RETURN.
--
-- We do NOT edit 20260422aa_v_entity_confidence_matview.sql — migrations are
-- immutable once shipped. This is a NEW migration that replaces the function
-- definition via CREATE OR REPLACE.

SET statement_timeout = '30min';

CREATE OR REPLACE FUNCTION refresh_entity_confidence_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- W8: tier-sized work_mem. Supabase Medium = 4GB RAM → 128MB is 1/32 of RAM
  -- (well under the RAM/16 = 256MB ceiling, safe under concurrent load).
  SET LOCAL work_mem = '128MB';
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_entity_confidence;
END
$$;

REVOKE ALL ON FUNCTION refresh_entity_confidence_mv() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_entity_confidence_mv() TO service_role;

COMMENT ON FUNCTION refresh_entity_confidence_mv() IS
  'Phase 2 (round-2 W8): SET LOCAL work_mem=128MB before REFRESH MATERIALIZED VIEW CONCURRENTLY. Tier-sized for Supabase Medium (4GB) — safe under RAM/16 ceiling per cl-bulk-data-defensive.md #7.';
