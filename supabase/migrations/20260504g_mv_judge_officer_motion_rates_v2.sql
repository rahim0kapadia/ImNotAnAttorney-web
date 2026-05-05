-- 20260504g_mv_judge_officer_motion_rates_v2.sql
-- J3 v2: Adds officer dimension to mv_judge_officer_motion_rates.
-- Unblocked by Task 29 extractor: classified_opinions.officer_names now populated
-- (1.36M / 1.46M opinions, 136K with at least one officer mention).
--
-- v1 was (judge × motion_type) only — see 20260504b for v1.
-- v2 is (judge × motion_type × officer_name).
--
-- Cited expert: Lukas Fittl — matview + concurrent-refresh; Lissner FLP — n>=3 floor.

DROP MATERIALIZED VIEW IF EXISTS public.mv_judge_officer_motion_rates;

CREATE MATERIALIZED VIEW public.mv_judge_officer_motion_rates AS
WITH classified_motions AS (
  -- Pull motion-bearing AND officer-bearing opinions linked to a judge
  SELECT
    co.cluster_id::bigint  AS cluster_id_int,
    co.motion_types,
    co.motion_outcomes,
    co.officer_names,
    com.author_id          AS judge_cl_person_id
  FROM public.classified_opinions co
  JOIN public.cl_opinions_meta com
    ON com.cluster_id = co.cluster_id::bigint
  WHERE com.author_id IS NOT NULL
    AND co.motion_types IS NOT NULL
    AND array_length(co.motion_types, 1) > 0
    AND co.officer_names IS NOT NULL
    AND array_length(co.officer_names, 1) > 0
),
-- Unnest motion_types AND officer_names cross-product
exploded AS (
  SELECT
    cm.judge_cl_person_id,
    unnest(cm.motion_types)   AS motion_type,
    unnest(cm.officer_names)  AS officer_name_raw,
    cm.motion_outcomes
  FROM classified_motions cm
),
with_outcome AS (
  SELECT
    e.judge_cl_person_id,
    e.motion_type,
    -- Normalize officer name for stable grouping (lowercase, trim)
    lower(trim(e.officer_name_raw)) AS officer_name_normalized,
    e.officer_name_raw              AS officer_name_display,
    -- motion_outcomes is jsonb keyed by motion_type
    (e.motion_outcomes ->> e.motion_type) AS outcome
  FROM exploded e
  WHERE e.motion_type IS NOT NULL
    AND length(trim(e.officer_name_raw)) > 0
),
aggregated AS (
  SELECT
    wo.judge_cl_person_id,
    wo.motion_type,
    wo.officer_name_normalized,
    -- Pick a representative display form (most-frequent variant, deterministic)
    (array_agg(wo.officer_name_display ORDER BY wo.officer_name_display))[1] AS officer_name_display,
    COUNT(*)                                                  AS sample_size,
    COUNT(*) FILTER (WHERE wo.outcome ILIKE '%grant%')        AS granted_count,
    COUNT(*) FILTER (WHERE wo.outcome ILIKE '%den%')          AS denied_count,
    ROUND(
      COUNT(*) FILTER (WHERE wo.outcome ILIKE '%grant%')::numeric
      / NULLIF(COUNT(*), 0), 4
    )                                                          AS grant_rate,
    now()                                                      AS computed_at
  FROM with_outcome wo
  GROUP BY 1, 2, 3
  HAVING COUNT(*) >= 3  -- Lissner FLP norm
)
SELECT
  a.judge_cl_person_id,
  a.motion_type,
  a.officer_name_normalized,
  a.officer_name_display,
  a.sample_size,
  a.granted_count,
  a.denied_count,
  a.grant_rate,
  a.computed_at
FROM aggregated a;

-- CONCURRENT-refresh requires a unique index.
CREATE UNIQUE INDEX uq_mv_jomr_judge_motion_officer
  ON public.mv_judge_officer_motion_rates
    (judge_cl_person_id, motion_type, officer_name_normalized);

-- Hot lookup: by officer (Officer BG Check query path)
CREATE INDEX idx_mv_jomr_officer
  ON public.mv_judge_officer_motion_rates
    (officer_name_normalized);

-- Hot lookup: by judge (X-Ray + War Room query path)
CREATE INDEX idx_mv_jomr_judge
  ON public.mv_judge_officer_motion_rates
    (judge_cl_person_id);

-- Hot lookup: by motion_type
CREATE INDEX idx_mv_jomr_motion_type
  ON public.mv_judge_officer_motion_rates
    (motion_type);

COMMENT ON MATERIALIZED VIEW public.mv_judge_officer_motion_rates IS
  'J3 substrate v2 — judge × motion_type × officer_name aggregated grant rate. Source: classified_opinions × cl_opinions_meta (author_id) × officer_names extracted from cl_opinion_bodies.plain_text by scripts/bulk-extract-opinion-entities.mjs. Replaces v1 (judge × motion only). Refresh: weekly via /api/cron/refresh-cross-corpus-matviews. Sample-size floor n>=3.';
