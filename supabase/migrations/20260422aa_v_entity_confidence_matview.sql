-- Phase 2 pre-fix: turn v_entity_confidence into a materialized view so
-- .in() lookups from the report render path resolve in single-digit ms
-- instead of timing out on the full-table aggregate. Refreshed nightly
-- via /api/cron/refresh-entity-confidence (cron-job.org).
--
-- Defensive session settings per ~/.claude/rules/cl-bulk-data-defensive.md.

SET statement_timeout = '30min';
SET idle_in_transaction_session_timeout = '5min';
SET tcp_keepalives_idle = 60;
SET tcp_keepalives_interval = 10;
SET tcp_keepalives_count = 6;

DROP VIEW IF EXISTS v_entity_confidence CASCADE;
DROP MATERIALIZED VIEW IF EXISTS v_entity_confidence CASCADE;

CREATE MATERIALIZED VIEW v_entity_confidence AS
SELECT
  es.entity_type,
  es.entity_id,
  COUNT(DISTINCT es.source_system)::int AS source_count,
  array_agg(DISTINCT es.source_system ORDER BY es.source_system) AS source_systems,
  COALESCE(SUM(ssw.weight), 0)::numeric AS weighted_score,
  CASE
    WHEN COUNT(DISTINCT es.source_system) >= 6 THEN 'platinum'
    WHEN COUNT(DISTINCT es.source_system) = 5 THEN 'gold'
    WHEN COUNT(DISTINCT es.source_system) = 4 THEN 'verified'
    WHEN COUNT(DISTINCT es.source_system) = 3 THEN 'high'
    WHEN COUNT(DISTINCT es.source_system) = 2 THEN 'medium'
    ELSE 'standard'
  END AS confidence_level
FROM entity_sources es
LEFT JOIN source_system_weights ssw ON ssw.source_system = es.source_system
GROUP BY es.entity_type, es.entity_id;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX idx_v_entity_confidence_pk
  ON v_entity_confidence(entity_type, entity_id);
-- Badge-transformer lookup path uses WHERE entity_id = ANY(array).
CREATE INDEX idx_v_entity_confidence_entity_id
  ON v_entity_confidence(entity_id);
-- Footer aggregate groups by confidence_level.
CREATE INDEX idx_v_entity_confidence_confidence_level
  ON v_entity_confidence(confidence_level);

GRANT SELECT ON v_entity_confidence TO anon, authenticated, service_role;

-- SECURITY DEFINER refresh wrapper so the cron endpoint can call via RPC
-- without owning the matview directly.
CREATE OR REPLACE FUNCTION refresh_entity_confidence_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_entity_confidence;
END
$$;

REVOKE ALL ON FUNCTION refresh_entity_confidence_mv() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_entity_confidence_mv() TO service_role;

COMMENT ON MATERIALIZED VIEW v_entity_confidence IS
  'Phase 2 (2026-04-22): per-entity aggregate of distinct source systems, weighted score, and 6-tier confidence label. Refreshed nightly via cron. Used by /report/token badge transformer for single-digit-ms lookups.';
