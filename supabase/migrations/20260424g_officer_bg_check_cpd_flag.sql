-- 20260424g_officer_bg_check_cpd_flag.sql
-- Feature flag gating the Chicago PD (Invisible Institute) depth section in
-- /officer-background-check. Default OFF. Operator flips via
-- /api/admin/feature-flags after the E2E fixture in
-- scripts/verify-officer-render-chicago.mjs passes against Finnigan + Evans.
--
-- Data source:       public.cpd_officers + public.cpd_complaints
--                    (migration 20260424b_cpd_invisible_institute.sql,
--                     branch feat/ingest-cpd-invisible-institute commit 65ba342f)
-- Query site:        src/lib/tier9-reports/query.ts → queryCpdProfile
-- Coverage site:     src/lib/tier9-reports/coverage.ts → checkOfficerCoverage
-- Render site:       src/lib/tier9-reports/render.ts → renderCpdSection
-- Pristine-gate ref: docs/plans/2026-04-24-officer-bg-check-chicago-integration.md
--
-- Flip to ON:
--   UPDATE public.feature_flags
--   SET is_enabled = true, updated_at = NOW()
--   WHERE flag_key = 'officer_bg_check_cpd_enhanced';
--
-- Feature-flag cache TTL is 5 minutes, see src/lib/feature-flags.ts.

INSERT INTO public.feature_flags (flag_key, is_enabled, description) VALUES
  (
    'officer_bg_check_cpd_enhanced',
    false,
    'Officer Background Check Tier 9: attach Chicago PD FOIA complaint history (Invisible Institute, 2000-mid-2018) when agency matches CPD whitelist or state=IL. Dark launch 2026-04-24.'
  )
ON CONFLICT (flag_key) DO NOTHING;
