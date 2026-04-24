-- Migration: Courthouse Intelligence Pack $147 (M5) — aggregate views
--
-- Supports src/lib/tier9-reports/courthouse-intelligence.ts. Creates two
-- server-side aggregate views that replace in-Node fan-outs:
--
--   1. v_ussc_district_sentencing_agg — one row per USSC district with
--      n_cases, median/mean senttot, pct_got_prison, pct_downward_departure,
--      FY range. Replaces fetching ~80k raw rows per district into Node
--      (previously would have needed 320k+ rows for a 4-district state).
--
--   2. v_courthouse_internal_judge_agg — safety abstraction for the 983
--      disposition-profile judges. Exposes name + n_cases + district_id
--      only, deliberately STRIPPED of judge_canonical_id so the
--      predictive-fingerprint lookup surface is not exposed via this view.
--      Predictive signals (sentencing fingerprint, motion histograms) are
--      reached ONLY via the Judge Report Card $197 pipeline which goes
--      through judge_disposition_profile directly with service-role.
--
-- RLS posture:
--   - Both views are CREATE VIEW (not matviews). Row-level security on the
--     base tables already applies: judge_disposition_profile and
--     ussc_sentencing_all are admin-service-role-only reads.
--   - We grant SELECT to `authenticated` on the aggregate views so
--     service-role Tier 9 generators can query without needing base-table
--     grants. `anon` is NOT granted — no public exposure.
--
-- Tier monotonicity:
--   - Views expose AGGREGATE only. No per-judge fingerprint signals, no
--     named-defendant predictions, no case-specific similar-cases joins.
--   - Any future expansion (judge-level matview, charge-specific filter)
--     must go in a separate migration and must be gated against the
--     per-tier monotonicity rules in
--     docs/plans/2026-04-23-data-to-product-autonomous-execution.md.

BEGIN;

-- ============================================================
-- 1. USSC district sentencing aggregates
-- ============================================================
CREATE OR REPLACE VIEW public.v_ussc_district_sentencing_agg AS
SELECT
  s.district                                                   AS district_code,
  COUNT(*)                                                     AS n_cases,
  -- Percentiles on senttot (months). senttot is stored as text in the
  -- bulk-loaded USSC table so we cast here. NULLs are filtered.
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (s.senttot)::numeric)
    FILTER (WHERE s.senttot IS NOT NULL)                       AS median_months,
  AVG((s.senttot)::numeric)
    FILTER (WHERE s.senttot IS NOT NULL)                       AS mean_months,
  -- pct_got_prison: any row where totprisn > 0
  100.0 * SUM(CASE WHEN COALESCE(NULLIF(s.totprisn, '')::numeric, 0) > 0 THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*), 0)                                  AS pct_got_prison,
  -- pct_downward_departure: conservative proxy matching the Node impl —
  -- pcntdept < 0 OR mnthdept starts with '-' (signed departure months).
  100.0 * SUM(CASE
    WHEN COALESCE(NULLIF(s.pcntdept, '')::numeric, 0) < 0 THEN 1
    WHEN s.mnthdept IS NOT NULL AND left(s.mnthdept, 1) = '-' THEN 1
    ELSE 0
  END)
        / NULLIF(COUNT(*), 0)                                  AS pct_downward_departure,
  MIN((s.fy)::int)                                             AS earliest_fy,
  MAX((s.fy)::int)                                             AS latest_fy
FROM public.ussc_sentencing_all s
WHERE s.district IS NOT NULL
GROUP BY s.district;

COMMENT ON VIEW public.v_ussc_district_sentencing_agg IS
  'Courthouse Intelligence Pack $147 — server-side USSC district sentencing aggregates. Replaces per-district Node fan-outs. Banned from anon; service-role and authenticated only. See src/lib/tier9-reports/courthouse-intelligence.ts.';

GRANT SELECT ON public.v_ussc_district_sentencing_agg TO authenticated;
-- Explicit DENY for anon via absence of grant; no row-level policy needed
-- since this is a view and base-table grants still enforce.

-- ============================================================
-- 2. Internal judge aggregate (canonical_id-stripped)
-- ============================================================
CREATE OR REPLACE VIEW public.v_courthouse_internal_judge_agg AS
SELECT
  jdp.judge_name,
  jdp.district_id,
  jdp.n_cases,
  jdp.disposition_data_available
  -- INTENTIONALLY OMITTED: judge_canonical_id, author_id, plea_rate,
  -- trial_rate, conviction_rate, deviation_vs_district. These are the
  -- predictive / demographic signals that belong exclusively to the $197
  -- Judge Report Card surface. Exposing them here would break tier
  -- monotonicity (M5 $147 < $197).
FROM public.judge_disposition_profile jdp;

COMMENT ON VIEW public.v_courthouse_internal_judge_agg IS
  'Courthouse Intelligence Pack $147 — aggregate judge caseload only, canonical_id intentionally stripped so this view cannot be used as a lookup into the predictive-fingerprint layer. Predictive signals stay in the $197 Judge Question Brief pipeline. Service-role + authenticated only.';

GRANT SELECT ON public.v_courthouse_internal_judge_agg TO authenticated;

COMMIT;
