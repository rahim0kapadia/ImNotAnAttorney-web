-- TICKET-2: Judge Disposition-Time Benchmarks (matview)
--
-- Builds a per-(judge, case_class) matview of how long cases take from filing
-- to terminal disposition. Powers the Judge Question Brief ($197), IB Court Prep
-- section, and X-Ray ($2,497) Mercer-voice line:
--   "Your judge takes longer than 73% of the bench. That's not random."
--
-- Source: cl_dockets (~71M federal docket headers).  Each row = one case.
-- We group by judge_id × case_class (criminal/civil) and compute median, p25,
-- p75, sample_n on (date_terminated - date_filed) in days.  District-level
-- baselines are aggregated in a sibling matview for the percentile-band
-- comparison the helper renders.
--
-- DESIGN NOTES
-- - Winners pattern (cl-bulk-data-defensive #12): the inner CTE projects ONLY
--   the four columns the SORT inside PERCENTILE_DISC needs (author_id,
--   case_class, days, court_id), not the full ~22-column docket row.  Sort
--   width drops from ~1KB/row to ~30B/row -> ~30x less spill on the 31M-row
--   pass.
-- - case_class is derived deterministically from docket_number (':NN-cr-' /
--   ':NN-cv-' PACER pattern) with a fall-through to nature_of_suit code-prefix
--   bucketing for older rows that don't carry the type token.  This is the
--   same join shape used by build-judge-disposition-profile-v2.mjs which is
--   already proven against this dataset.
-- - Cardinality target: ~25K judges x 2 case_classes = ~50K rows in the
--   judge matview, ~94 districts x 2 case_classes = ~188 rows in the district
--   matview.  Tiny on disk; cheap to refresh weekly.
-- - REFRESH MATERIALIZED VIEW CONCURRENTLY requires a UNIQUE index on the
--   matview, so we add one per matview.  Concurrent refresh keeps reader
--   queries (the JRC + IB Court Prep helper) unblocked during refresh.
-- - k-anonymity floor is `sample_n >= 5` in the matview (parity with
--   judge_disposition_profile).  The 30-row coverage gate from the ticket is
--   enforced in the helper layer, not the matview, so the data is available
--   for future district-aggregate queries that don't need the per-judge floor.
-- - Outliers: cap at 7300 days (20 years).  Federal cases legitimately run
--   5-7 years; anything >20yr is a data error or a reopened-then-reclosed
--   flag we don't want skewing the median.
--
-- Defensive session settings per ~/.claude/rules/cl-bulk-data-defensive.md.

SET statement_timeout = '60min';
SET idle_in_transaction_session_timeout = '5min';
SET tcp_keepalives_idle = 60;
SET tcp_keepalives_interval = 10;
SET tcp_keepalives_count = 6;
-- XL tier (16GB RAM, RAM/16 = 1GB ceiling); 512MB safe under concurrent load
-- per cl-bulk-data-defensive.md #7 + memory `decision-xl-until-bulk-complete.md`.
SET work_mem = '512MB';
SET maintenance_work_mem = '1GB';

-- ----------------------------------------------------------------------------
-- Drop prior versions (idempotent — we DROP+CREATE because IF NOT EXISTS does
-- not change persistence/structure of an existing matview, per
-- cl-bulk-data-defensive.md #9).
-- ----------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS judge_disposition_stats CASCADE;
DROP MATERIALIZED VIEW IF EXISTS district_disposition_stats CASCADE;

-- ----------------------------------------------------------------------------
-- Judge x case_class matview
-- ----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW judge_disposition_stats AS
WITH eligible AS (
  -- Winners pattern: project ONLY the columns we need before any sort.
  -- This narrows the SORT input that PERCENTILE_DISC triggers downstream.
  SELECT
    cd.assigned_to_id          AS author_id,
    cd.court_id,
    -- case_class derivation:
    --   1) PACER docket-number token (':NN-cr-' / ':NN-cv-') is the
    --      authoritative source for federal case type
    --   2) Fallback: nature_of_suit code 010-099 are criminal in FJC IDB
    --      (we treat anything else as civil for the bucket)
    CASE
      WHEN cd.docket_number ~ ':[0-9]{2}-cr-' THEN 'criminal'
      WHEN cd.docket_number ~ ':[0-9]{2}-cv-' THEN 'civil'
      WHEN substring(cd.nature_of_suit FROM '^[0-9]{3}') BETWEEN '010' AND '099' THEN 'criminal'
      ELSE 'civil'
    END AS case_class,
    (cd.date_terminated - cd.date_filed)::int AS days_to_disposition
  FROM public.cl_dockets cd
  WHERE cd.date_terminated IS NOT NULL
    AND cd.date_filed IS NOT NULL
    AND cd.assigned_to_id IS NOT NULL
    AND cd.date_terminated >= cd.date_filed
    AND (cd.date_terminated - cd.date_filed) <= 7300
)
SELECT
  e.author_id,
  e.case_class,
  COUNT(*)::int AS sample_n,
  -- Discrete percentile picks the closest actual observation; for a
  -- "median days" headline that's the right primitive (we don't want
  -- a half-day interpolated value when reporting calendar days).
  PERCENTILE_DISC(0.25) WITHIN GROUP (ORDER BY e.days_to_disposition)::int AS p25_days,
  PERCENTILE_DISC(0.50) WITHIN GROUP (ORDER BY e.days_to_disposition)::int AS median_days,
  PERCENTILE_DISC(0.75) WITHIN GROUP (ORDER BY e.days_to_disposition)::int AS p75_days,
  -- Most common court for this judge (used when the helper needs to
  -- look up the district baseline without a separate join).
  MODE() WITHIN GROUP (ORDER BY e.court_id) AS primary_court_id,
  NOW() AS data_as_of
FROM eligible e
GROUP BY e.author_id, e.case_class
HAVING COUNT(*) >= 5;  -- k-anonymity floor; helper enforces 30 for client display

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX idx_judge_disposition_stats_pk
  ON judge_disposition_stats (author_id, case_class);

-- Supports "all judges in this district" rollups + district baseline lookup.
CREATE INDEX idx_judge_disposition_stats_court
  ON judge_disposition_stats (primary_court_id, case_class);

GRANT SELECT ON judge_disposition_stats TO anon, authenticated, service_role;

COMMENT ON MATERIALIZED VIEW judge_disposition_stats IS
  'TICKET-2 (2026-05-03): per-(judge_id, case_class) median/p25/p75 days from filing to terminal disposition. Source: cl_dockets (~71M rows, ~31M eligible). Winners-pattern aggregation per cl-bulk-data-defensive.md #12. Refreshed weekly via /api/cron/refresh-judge-disposition.';

-- ----------------------------------------------------------------------------
-- District x case_class baseline matview (for percentile-band comparison)
-- ----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW district_disposition_stats AS
WITH eligible AS (
  SELECT
    cd.court_id,
    CASE
      WHEN cd.docket_number ~ ':[0-9]{2}-cr-' THEN 'criminal'
      WHEN cd.docket_number ~ ':[0-9]{2}-cv-' THEN 'civil'
      WHEN substring(cd.nature_of_suit FROM '^[0-9]{3}') BETWEEN '010' AND '099' THEN 'criminal'
      ELSE 'civil'
    END AS case_class,
    (cd.date_terminated - cd.date_filed)::int AS days_to_disposition
  FROM public.cl_dockets cd
  WHERE cd.date_terminated IS NOT NULL
    AND cd.date_filed IS NOT NULL
    AND cd.court_id IS NOT NULL
    AND cd.date_terminated >= cd.date_filed
    AND (cd.date_terminated - cd.date_filed) <= 7300
)
SELECT
  e.court_id,
  e.case_class,
  COUNT(*)::int AS sample_n,
  PERCENTILE_DISC(0.10) WITHIN GROUP (ORDER BY e.days_to_disposition)::int AS p10_days,
  PERCENTILE_DISC(0.25) WITHIN GROUP (ORDER BY e.days_to_disposition)::int AS p25_days,
  PERCENTILE_DISC(0.50) WITHIN GROUP (ORDER BY e.days_to_disposition)::int AS median_days,
  PERCENTILE_DISC(0.75) WITHIN GROUP (ORDER BY e.days_to_disposition)::int AS p75_days,
  PERCENTILE_DISC(0.90) WITHIN GROUP (ORDER BY e.days_to_disposition)::int AS p90_days,
  NOW() AS data_as_of
FROM eligible e
GROUP BY e.court_id, e.case_class
HAVING COUNT(*) >= 30;  -- District baseline needs 30+ to be meaningful

CREATE UNIQUE INDEX idx_district_disposition_stats_pk
  ON district_disposition_stats (court_id, case_class);

GRANT SELECT ON district_disposition_stats TO anon, authenticated, service_role;

COMMENT ON MATERIALIZED VIEW district_disposition_stats IS
  'TICKET-2 (2026-05-03): per-(court_id, case_class) p10/p25/median/p75/p90 days for district-level baseline used by Judge Question Brief percentile-band comparison.';

-- ----------------------------------------------------------------------------
-- SECURITY DEFINER refresh wrapper
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_judge_disposition_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  judge_count int;
  district_count int;
  started_ms bigint;
BEGIN
  -- SET LOCAL scopes the bump to this function invocation only.
  -- 256MB is well under the XL-tier RAM/16 = 1GB ceiling per
  -- cl-bulk-data-defensive.md #7.  REFRESH MATERIALIZED VIEW CONCURRENTLY
  -- runs a SORT op which is what work_mem governs (NOT maintenance_work_mem).
  SET LOCAL work_mem = '256MB';

  started_ms := (EXTRACT(epoch FROM clock_timestamp()) * 1000)::bigint;

  REFRESH MATERIALIZED VIEW CONCURRENTLY judge_disposition_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY district_disposition_stats;

  SELECT COUNT(*) INTO judge_count FROM judge_disposition_stats;
  SELECT COUNT(*) INTO district_count FROM district_disposition_stats;

  RETURN jsonb_build_object(
    'judge_rows', judge_count,
    'district_rows', district_count,
    'elapsed_ms', (EXTRACT(epoch FROM clock_timestamp()) * 1000)::bigint - started_ms
  );
END
$$;

REVOKE ALL ON FUNCTION refresh_judge_disposition_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_judge_disposition_stats() TO service_role;

COMMENT ON FUNCTION refresh_judge_disposition_stats() IS
  'TICKET-2 (2026-05-03): SET LOCAL work_mem=256MB then REFRESH MATERIALIZED VIEW CONCURRENTLY both judge_disposition_stats + district_disposition_stats. Returns row counts + elapsed ms.';
