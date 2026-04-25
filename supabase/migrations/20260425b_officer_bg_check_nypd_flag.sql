-- 20260425b_officer_bg_check_nypd_flag.sql
-- Feature flag for NYPD CCRB depth in the Officer Background Check Tier 9
-- product. Sibling of officer_bg_check_cpd_enhanced (created 2026-04-24).
--
-- Default OFF — dark launch. Flip to true after PR merge + Vercel deploy +
-- E2E verification with a known-bad NYPD officer fixture.

INSERT INTO public.feature_flags (flag_key, description, is_enabled, tier_scope)
VALUES (
  'officer_bg_check_nypd_enhanced',
  'Officer Background Check Tier 9: attach NYPD CCRB civilian-complaint history (NYC OpenData, 1985-present) when agency matches NYPD whitelist or state=NY. Sources: nypd_officers (96,494) + nypd_complaints (139,487) + nypd_allegations (423,693) + nypd_penalties (14,682). Dark launch 2026-04-25.',
  false,
  NULL
)
ON CONFLICT (flag_key) DO UPDATE
  SET description = EXCLUDED.description,
      updated_at = NOW();
