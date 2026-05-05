-- 20260504c_mv_judge_bench_fingerprint.sql
-- BR-J1 substrate: judge sentencing bench fingerprint.
-- Powers FSDR BenchRecon ($997) "judge sentencing fingerprint" section +
-- War Room ($4,997) judge × prosecutor sentencing divergence axis.
--
-- Source tables:
--   judge_sentencing_patterns  — pre-aggregated USSC judge-level stats (3,232 rows)
--     joined via normalized name similarity to:
--   judge_profiles             — canonical judge registry with cl_person_id
--
-- Name bridge: pg_trgm similarity on normalized name columns.
-- Per Lukas Fittl: matview + unique index enables CONCURRENT refresh.
-- Source: https://pganalyze.com/blog/materialized-views-postgresql
--
-- NOTE: officer dimension not yet present. This matview carries the
-- judge × sentencing-fingerprint dimension now.
-- Unique index on judge_cl_person_id enables CONCURRENT refresh weekly.

DROP MATERIALIZED VIEW IF EXISTS public.mv_judge_bench_fingerprint;

CREATE MATERIALIZED VIEW public.mv_judge_bench_fingerprint AS
WITH
-- Normalize judge_sentencing_patterns name for similarity matching
patterns_normalized AS (
  SELECT
    jsp.id                          AS pattern_id,
    jsp.judge_name_normalized,
    jsp.district,
    jsp.total_cases,
    jsp.median_sentence_months,
    jsp.mean_sentence_months,
    jsp.p25_sentence_months,
    jsp.p75_sentence_months,
    jsp.downward_departure_rate,
    jsp.upward_departure_rate,
    jsp.substantial_assistance_rate,
    jsp.government_sponsored_below_range_rate,
    jsp.offense_breakdown,
    jsp.criminal_history_breakdown
  FROM public.judge_sentencing_patterns jsp
  WHERE
    jsp.judge_name_normalized IS NOT NULL
    AND length(trim(jsp.judge_name_normalized)) > 3
    -- Exclude district-level aggregate rows (no comma in normalized name = district aggregate)
    AND jsp.judge_name_normalized NOT ILIKE '%district%'
    AND jsp.judge_name_normalized NOT ILIKE '%division%'
    AND jsp.total_cases >= 10   -- Lissner FLP norm: n>=10 for citable signal
),
-- Best-match join: each judge_profile matches at most one sentencing_pattern row
-- Uses trigram similarity; take highest-similarity match per judge
name_bridge AS (
  SELECT DISTINCT ON (jp.cl_person_id)
    jp.cl_person_id,
    jp.full_name                    AS profile_name,
    pn.pattern_id,
    pn.judge_name_normalized,
    pn.district,
    pn.total_cases,
    pn.median_sentence_months,
    pn.mean_sentence_months,
    pn.p25_sentence_months,
    pn.p75_sentence_months,
    pn.downward_departure_rate,
    pn.upward_departure_rate,
    pn.substantial_assistance_rate,
    pn.government_sponsored_below_range_rate,
    pn.offense_breakdown,
    pn.criminal_history_breakdown,
    -- Similarity score for audit / confidence
    similarity(
      lower(regexp_replace(jp.full_name, '[^a-zA-Z ]', '', 'g')),
      pn.judge_name_normalized
    )                               AS name_similarity
  FROM public.judge_profiles jp
  JOIN patterns_normalized pn
    ON similarity(
         lower(regexp_replace(jp.full_name, '[^a-zA-Z ]', '', 'g')),
         pn.judge_name_normalized
       ) >= 0.3
  WHERE jp.cl_person_id IS NOT NULL
  ORDER BY jp.cl_person_id,
    similarity(
      lower(regexp_replace(jp.full_name, '[^a-zA-Z ]', '', 'g')),
      pn.judge_name_normalized
    ) DESC
),
-- Enrich with docket caseload from cl_dockets
docket_caseload AS (
  SELECT
    cd.assigned_to_id               AS judge_cl_person_id,
    COUNT(*)                        AS federal_docket_count,
    MIN(cd.date_filed)              AS earliest_docket,
    MAX(cd.date_filed)              AS latest_docket
  FROM public.cl_dockets cd
  WHERE cd.assigned_to_id IS NOT NULL
  GROUP BY cd.assigned_to_id
)
SELECT
  nb.cl_person_id                   AS judge_cl_person_id,
  nb.profile_name,
  nb.judge_name_normalized,
  nb.district,
  nb.total_cases                    AS ussc_total_cases,
  nb.median_sentence_months,
  nb.mean_sentence_months,
  nb.p25_sentence_months,
  nb.p75_sentence_months,
  nb.downward_departure_rate,
  nb.upward_departure_rate,
  nb.substantial_assistance_rate,
  nb.government_sponsored_below_range_rate,
  nb.offense_breakdown,
  nb.criminal_history_breakdown,
  nb.name_similarity,
  dc.federal_docket_count,
  dc.earliest_docket,
  dc.latest_docket,
  now()                             AS computed_at
FROM name_bridge nb
LEFT JOIN docket_caseload dc
  ON dc.judge_cl_person_id = nb.cl_person_id::bigint;

-- CONCURRENT-refresh requires a unique index
CREATE UNIQUE INDEX uq_mv_jbf_judge
  ON public.mv_judge_bench_fingerprint (judge_cl_person_id);

-- Hot lookup: by judge (X-Ray / War Room / FSDR query path)
CREATE INDEX idx_mv_jbf_judge
  ON public.mv_judge_bench_fingerprint (judge_cl_person_id);

-- Hot lookup: by district (cross-district comparison path)
CREATE INDEX idx_mv_jbf_district
  ON public.mv_judge_bench_fingerprint (district);

COMMENT ON MATERIALIZED VIEW public.mv_judge_bench_fingerprint IS
  'BR-J1 substrate: judge sentencing bench fingerprint. Joins judge_sentencing_patterns (USSC-derived, 3K judges) to judge_profiles via trigram name similarity (threshold 0.3). Enriched with cl_dockets caseload. Powers FSDR BenchRecon sentencing fingerprint section + War Room divergence axis. Refresh: weekly via /api/cron/refresh-cross-corpus-matviews. n>=10 floor per Lissner FLP norm.';
