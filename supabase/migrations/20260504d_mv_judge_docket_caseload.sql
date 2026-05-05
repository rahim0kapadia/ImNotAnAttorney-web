-- 20260504d_mv_judge_docket_caseload.sql
-- J1 substrate: judge docket caseload fingerprint from cl_dockets.
-- Powers X-Ray ($2,497) "closed-ecosystem cross-party" section +
-- War Room ($4,997) judge caseload / recusal-flag analysis.
--
-- Cited expert: Lukas Fittl — matview with unique index for CONCURRENT refresh.
-- Source: https://pganalyze.com/blog/materialized-views-postgresql
--
-- cl_dockets has 186 distinct courts with assigned judges.
-- Aggregates per judge: total dockets, criminal vs civil split, active/terminated,
-- court distribution, date range, jury demand profile.
-- Sample-size floor n>=3 for citable signal (Lissner FLP norm).

DROP MATERIALIZED VIEW IF EXISTS public.mv_judge_docket_caseload;

CREATE MATERIALIZED VIEW public.mv_judge_docket_caseload AS
WITH
judge_dockets AS (
  SELECT
    cd.assigned_to_id                              AS judge_cl_person_id,
    cd.court_id,
    cd.date_filed,
    cd.date_terminated,
    cd.date_last_filing,
    cd.nature_of_suit,
    cd.jury_demand,
    cd.jurisdiction_type,
    -- Criminal docket flag: nature_of_suit starts with '5' (USDC NOS codes 500-599 = criminal)
    cd.nature_of_suit LIKE '5%'                    AS is_criminal,
    cd.date_terminated IS NULL                     AS is_active
  FROM public.cl_dockets cd
  WHERE cd.assigned_to_id IS NOT NULL
),
aggregated AS (
  SELECT
    judge_cl_person_id,
    COUNT(*)                                                      AS total_dockets,
    COUNT(*) FILTER (WHERE is_criminal)                           AS criminal_dockets,
    COUNT(*) FILTER (WHERE NOT is_criminal)                       AS civil_dockets,
    COUNT(*) FILTER (WHERE is_active)                             AS active_dockets,
    COUNT(*) FILTER (WHERE NOT is_active)                         AS terminated_dockets,
    -- Criminal fraction (0-1)
    ROUND(
      COUNT(*) FILTER (WHERE is_criminal)::numeric
      / NULLIF(COUNT(*), 0), 4
    )                                                             AS criminal_fraction,
    -- Jury demand profile
    COUNT(*) FILTER (WHERE jury_demand = 'Plaintiff')             AS jury_demand_plaintiff,
    COUNT(*) FILTER (WHERE jury_demand = 'Defendant')             AS jury_demand_defendant,
    COUNT(*) FILTER (WHERE jury_demand = 'Both')                  AS jury_demand_both,
    COUNT(*) FILTER (WHERE jury_demand = 'None')                  AS jury_demand_none,
    -- Date range
    MIN(date_filed)                                               AS earliest_docket_date,
    MAX(date_filed)                                               AS latest_docket_date,
    MAX(date_last_filing)                                         AS last_activity_date,
    -- Court spread
    COUNT(DISTINCT court_id)                                      AS court_count,
    -- Jurisdiction breakdown
    COUNT(*) FILTER (WHERE jurisdiction_type = 'Federal Question') AS federal_question_dockets,
    COUNT(*) FILTER (WHERE jurisdiction_type = 'Diversity')        AS diversity_dockets,
    now()                                                         AS computed_at
  FROM judge_dockets
  GROUP BY judge_cl_person_id
  HAVING COUNT(*) >= 3  -- Lissner FLP norm: n>=3 for citable signal
),
-- Attach primary court (most dockets filed) and linked judge name
primary_court AS (
  SELECT DISTINCT ON (judge_cl_person_id)
    judge_cl_person_id,
    court_id AS primary_court_id,
    COUNT(*) OVER (PARTITION BY judge_cl_person_id, court_id) AS court_docket_count
  FROM judge_dockets
  ORDER BY judge_cl_person_id, COUNT(*) OVER (PARTITION BY judge_cl_person_id, court_id) DESC
)
SELECT
  a.judge_cl_person_id,
  jp.full_name                   AS judge_name,
  a.total_dockets,
  a.criminal_dockets,
  a.civil_dockets,
  a.active_dockets,
  a.terminated_dockets,
  a.criminal_fraction,
  a.jury_demand_plaintiff,
  a.jury_demand_defendant,
  a.jury_demand_both,
  a.jury_demand_none,
  a.earliest_docket_date,
  a.latest_docket_date,
  a.last_activity_date,
  a.court_count,
  a.federal_question_dockets,
  a.diversity_dockets,
  pc.primary_court_id,
  -- Years active on federal bench
  EXTRACT(YEAR FROM AGE(
    COALESCE(a.latest_docket_date, CURRENT_DATE),
    a.earliest_docket_date
  ))::integer                    AS years_on_bench,
  a.computed_at
FROM aggregated a
LEFT JOIN primary_court pc USING (judge_cl_person_id)
LEFT JOIN public.judge_profiles jp
  ON jp.cl_person_id::bigint = a.judge_cl_person_id;

-- CONCURRENT-refresh requires a unique index
CREATE UNIQUE INDEX uq_mv_jdc_judge
  ON public.mv_judge_docket_caseload (judge_cl_person_id);

-- Hot lookup: by judge (X-Ray / War Room query path)
CREATE INDEX idx_mv_jdc_judge
  ON public.mv_judge_docket_caseload (judge_cl_person_id);

-- Hot lookup: by primary court (cross-court comparison path)
CREATE INDEX idx_mv_jdc_court
  ON public.mv_judge_docket_caseload (primary_court_id);

-- Filter: criminal fraction threshold (recusal / bias signal path)
CREATE INDEX idx_mv_jdc_criminal_frac
  ON public.mv_judge_docket_caseload (criminal_fraction DESC NULLS LAST);

COMMENT ON MATERIALIZED VIEW public.mv_judge_docket_caseload IS
  'J1 substrate: judge docket caseload fingerprint. Aggregates cl_dockets (32M+ join rows, 186 courts) per judge: total/criminal/civil/active docket counts, jury demand profile, date range, primary court, years on bench. Powers X-Ray closed-ecosystem cross-party section + War Room recusal-flag analysis. Refresh: weekly via /api/cron/refresh-cross-corpus-matviews. Sample-size floor n>=3 per Lissner FLP norm.';
