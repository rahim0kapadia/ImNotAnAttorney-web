-- agency_incidents — derived view over officer_external_intel
--
-- arrest-survival-kit ($47) was scoped against a hypothetical agency_incidents
-- table but no ingestion existed. officer_external_intel (454K rows) has the
-- same agency-level data already populated; this view is the agency-rollup.
--
-- Replay-safe: CREATE OR REPLACE VIEW.
-- Sources: D-T4 ship plan (docs/plans/2026-04-26-dt4-arrest-survival-kit-ship.md),
--          audit P0#1 closure.
--
-- Resolver contract (src/lib/defense-intelligence/query.ts queryArrestSurvivalKit):
--   SELECT agency, use_of_force_count, source_urls FROM agency_incidents
--   WHERE state = $1 ORDER BY use_of_force_count DESC LIMIT 20
--
-- HAVING filter restricts the view to agencies with non-zero incident signal so
-- the resolver does not surface "0 incidents" rows as agencies. complaint_count
-- is currently 0 across all source rows (NPI baseline) but is included in the
-- aggregation for forward compatibility once CCRB / CPD enrichment lands.

-- Replay-safe: DROP+CREATE is necessary because CREATE OR REPLACE VIEW will
-- reject column-set / column-type changes between iterations, and the design
-- went through one revision (correlated subquery → array_agg(DISTINCT [1]))
-- to fix a statement-timeout caused by per-group LATERAL unnest.

DROP VIEW IF EXISTS agency_incidents;

-- source_urls is text[] per row, but verified 2026-04-26 that
-- array_length(source_urls, 1) = 1 for all 454,288 rows in
-- officer_external_intel. So `array_agg(DISTINCT source_urls[1])` gives the
-- correct deduped flat list per (state, agency) group without the nested
-- unnest that statement-timeouts on full-state ORDER BY.
CREATE VIEW agency_incidents AS
SELECT
  state,
  agency,
  COUNT(*)::int AS officer_count,
  SUM(COALESCE(use_of_force_count, 0))::int AS use_of_force_count,
  SUM(COALESCE(complaint_count, 0))::int AS complaint_count,
  SUM(COALESCE(sustained_complaints, 0))::int AS sustained_complaints,
  array_remove(array_agg(DISTINCT source_urls[1]), NULL) AS source_urls,
  MAX(updated_at) AS last_updated
FROM officer_external_intel
WHERE state IS NOT NULL
  AND agency IS NOT NULL
  AND length(trim(state)) > 0
  AND length(trim(agency)) > 0
GROUP BY state, agency
HAVING SUM(COALESCE(use_of_force_count, 0)) > 0
    OR SUM(COALESCE(complaint_count, 0)) > 0;

COMMENT ON VIEW agency_incidents IS
  'Agency-level rollup of officer_external_intel filtered to agencies with non-zero incident signal. Powers arrest-survival-kit ($47). Created 2026-04-26 D-T4.';
