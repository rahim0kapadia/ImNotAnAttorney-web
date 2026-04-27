-- agency_incidents — derived view over officer_external_intel
--
-- arrest-survival-kit ($47) was scoped against a hypothetical agency_incidents
-- table but no ingestion existed. officer_external_intel (454K rows) has the
-- same agency-level data already populated; this view is the agency-rollup.
--
-- Sources: D-T4 ship plan (docs/plans/2026-04-26-dt4-arrest-survival-kit-ship.md),
--          PR #180 review fixes (docs/plans/2026-04-26-pr-180-review-fixes.md),
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
--
-- PR #180 review S5 (2026-04-26): The HAVING clause INTENTIONALLY admits
-- (use_of_force_count = 0 AND complaint_count > 0) rows so future complaint-
-- enrichment surfaces complaint-only agencies in this view automatically.
-- The resolver's `ORDER BY use_of_force_count DESC LIMIT 20` ranks those
-- rows last today (since their UoF=0). When complaint enrichment becomes a
-- dominant signal, the resolver should switch to a composite ordering
-- expression. Tracked here + at the resolver site
-- (src/lib/defense-intelligence/query.ts queryArrestSurvivalKit ORDER BY block).

-- PR #180 review S1 (2026-04-26): use CREATE OR REPLACE VIEW for atomicity.
-- The column set has stabilized; future column-type changes that PG rejects
-- in REPLACE-mode would be a separate migration with explicit DROP+CREATE.
CREATE OR REPLACE VIEW agency_incidents AS
-- PR #180 review W4 (2026-04-26): source_urls aggregation now safely handles
-- multi-URL rows. The prior implementation `array_agg(DISTINCT source_urls[1])`
-- only kept the FIRST URL of each row's text[] — relying on the unenforced
-- invariant `array_length(source_urls, 1) = 1` (verified 2026-04-26 across
-- 454K rows but no CHECK constraint). Future enrichment that writes
-- multi-URL arrays would silently drop URLs 2..N. New approach: in a CTE,
-- per-row unnest source_urls and dedupe by (state, agency) before joining
-- back to the GROUP BY result. The CTE pre-flattens source_urls width from
-- text[] to text, eliminating the need for nested unnest in the aggregate
-- and keeping per-state ORDER BY queries sub-second.
WITH per_row_url AS (
  SELECT state, agency, u AS source_url
  FROM officer_external_intel
  CROSS JOIN LATERAL unnest(COALESCE(source_urls, ARRAY[]::text[])) AS u
  WHERE state IS NOT NULL
    AND agency IS NOT NULL
    AND length(trim(state)) > 0
    AND length(trim(agency)) > 0
    AND u IS NOT NULL
),
agency_urls AS (
  SELECT state, agency, array_agg(DISTINCT source_url) AS source_urls
  FROM per_row_url
  GROUP BY state, agency
)
SELECT
  oei.state,
  oei.agency,
  COUNT(*)::int AS officer_count,
  SUM(COALESCE(oei.use_of_force_count, 0))::int AS use_of_force_count,
  SUM(COALESCE(oei.complaint_count, 0))::int AS complaint_count,
  SUM(COALESCE(oei.sustained_complaints, 0))::int AS sustained_complaints,
  COALESCE(au.source_urls, ARRAY[]::text[]) AS source_urls,
  MAX(oei.updated_at) AS last_updated
FROM officer_external_intel oei
LEFT JOIN agency_urls au
  ON au.state = oei.state AND au.agency = oei.agency
WHERE oei.state IS NOT NULL
  AND oei.agency IS NOT NULL
  AND length(trim(oei.state)) > 0
  AND length(trim(oei.agency)) > 0
GROUP BY oei.state, oei.agency, au.source_urls
HAVING SUM(COALESCE(oei.use_of_force_count, 0)) > 0
    OR SUM(COALESCE(oei.complaint_count, 0)) > 0;

COMMENT ON VIEW agency_incidents IS
  'Agency-level rollup of officer_external_intel filtered to agencies with non-zero incident signal. Powers arrest-survival-kit ($47). Created 2026-04-26 D-T4. PR #180 review: source_urls aggregation handles multi-URL arrays via LATERAL unnest CTE.';
