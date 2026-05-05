-- 20260504h_mv_judge_officer_motion_rates_v2_1.sql
-- J3 v2.1: lower sample-size floor from n>=3 to n>=2.
-- v2 (20260504g) had 58 rows because (judge × motion_type × specific_officer)
-- triples are highly specific and rarely repeat 3+ times. Lowering to n>=2
-- expands coverage while still filtering 1-shot noise.

DROP MATERIALIZED VIEW IF EXISTS public.mv_judge_officer_motion_rates;

CREATE MATERIALIZED VIEW public.mv_judge_officer_motion_rates AS
WITH classified_motions AS (
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
    lower(trim(e.officer_name_raw)) AS officer_name_normalized,
    e.officer_name_raw              AS officer_name_display,
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
  HAVING COUNT(*) >= 2  -- v2.1 lowered from 3 to 2
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

CREATE UNIQUE INDEX uq_mv_jomr_judge_motion_officer
  ON public.mv_judge_officer_motion_rates
    (judge_cl_person_id, motion_type, officer_name_normalized);

CREATE INDEX idx_mv_jomr_officer
  ON public.mv_judge_officer_motion_rates
    (officer_name_normalized);

CREATE INDEX idx_mv_jomr_judge
  ON public.mv_judge_officer_motion_rates
    (judge_cl_person_id);

CREATE INDEX idx_mv_jomr_motion_type
  ON public.mv_judge_officer_motion_rates
    (motion_type);

COMMENT ON MATERIALIZED VIEW public.mv_judge_officer_motion_rates IS
  'J3 substrate v2.1 — judge × motion_type × officer_name aggregated grant rate. Sample-size floor lowered from n>=3 (v2) to n>=2. After Task 34 motion-outcomes back-extractor populates more outcomes, v3 may bump back to n>=3.';
