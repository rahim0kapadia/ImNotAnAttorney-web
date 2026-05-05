-- 20260504b_mv_judge_officer_motion_rates.sql
-- J3 substrate: judge × motion-type → grant rate.
-- Powers Officer BG Check ($97) "judge-conditioned reliability" axis +
-- War Room ($4,997) cross-officer cross-judge matrix.
--
-- NOTE: officer_names column not yet present on classified_opinions
-- (added by Tasks 26-30 opinion-entity extractor). This matview carries the
-- judge × motion-type dimension now; officer linkage is wired in migration
-- 20260504g_mv_judge_officer_motion_rates_v2.sql after extractor ships.
--
-- Cited expert: Lukas Fittl — matview with unique index for CONCURRENT refresh,
-- WHERE-clause filters at matview-build to keep size bounded.
-- Source: https://pganalyze.com/blog/materialized-views-postgresql

DROP MATERIALIZED VIEW IF EXISTS public.mv_judge_officer_motion_rates;

CREATE MATERIALIZED VIEW public.mv_judge_officer_motion_rates AS
WITH classified_motions AS (
  -- Pull motion-bearing opinions linked to a judge via cl_opinions_meta
  SELECT
    co.cluster_id::bigint          AS cluster_id_int,
    co.motion_types                AS motion_types,
    co.motion_outcomes             AS motion_outcomes,
    com.author_id                  AS judge_cl_person_id
  FROM public.classified_opinions co
  JOIN public.cl_opinions_meta com
    ON com.cluster_id = co.cluster_id::bigint
  WHERE com.author_id IS NOT NULL
    AND co.motion_types IS NOT NULL
    AND array_length(co.motion_types, 1) > 0
),
exploded AS (
  -- Unnest motion_types array so each motion gets its own row
  SELECT
    cm.judge_cl_person_id,
    unnest(cm.motion_types)        AS motion_type,
    cm.motion_outcomes
  FROM classified_motions cm
),
with_outcome AS (
  SELECT
    e.judge_cl_person_id,
    e.motion_type,
    -- motion_outcomes is jsonb keyed by motion_type; extract per-motion outcome
    (e.motion_outcomes ->> e.motion_type) AS outcome
  FROM exploded e
  WHERE e.motion_type IS NOT NULL
),
aggregated AS (
  SELECT
    wo.judge_cl_person_id,
    wo.motion_type,
    COUNT(*)                                                   AS sample_size,
    COUNT(*) FILTER (WHERE wo.outcome ILIKE '%grant%')        AS granted_count,
    COUNT(*) FILTER (WHERE wo.outcome ILIKE '%den%')          AS denied_count,
    ROUND(
      COUNT(*) FILTER (WHERE wo.outcome ILIKE '%grant%')::numeric
      / NULLIF(COUNT(*), 0), 4
    )                                                          AS grant_rate,
    now()                                                      AS computed_at
  FROM with_outcome wo
  GROUP BY 1, 2
  HAVING COUNT(*) >= 3  -- Lissner FLP norm: n>=3 for citable signal
)
SELECT
  a.judge_cl_person_id,
  a.motion_type,
  a.sample_size,
  a.granted_count,
  a.denied_count,
  a.grant_rate,
  a.computed_at
FROM aggregated a;

-- CONCURRENT-refresh requires a unique index.
CREATE UNIQUE INDEX uq_mv_jomr_judge_motion
  ON public.mv_judge_officer_motion_rates (judge_cl_person_id, motion_type);

-- Hot lookup: by judge (X-Ray + War Room query path)
CREATE INDEX idx_mv_jomr_judge
  ON public.mv_judge_officer_motion_rates (judge_cl_person_id);

-- Hot lookup: by motion_type (filtering path)
CREATE INDEX idx_mv_jomr_motion_type
  ON public.mv_judge_officer_motion_rates (motion_type);

COMMENT ON MATERIALIZED VIEW public.mv_judge_officer_motion_rates IS
  'J3 substrate (v1 — judge×motion_type only; officer dimension added in v2 after opinion-entity extractor ships Tasks 26-30). Aggregates classified_opinions × cl_opinions_meta → judge × motion-type grant rate. Refresh: weekly via /api/cron/refresh-cross-corpus-matviews. Sample-size floor n>=3 per Lissner FLP norm.';
