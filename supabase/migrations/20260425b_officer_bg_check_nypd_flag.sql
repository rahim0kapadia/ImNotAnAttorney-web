-- 20260425b_officer_bg_check_nypd_flag.sql
-- Feature flag for NYPD CCRB depth in the Officer Background Check Tier 9
-- product. Sibling of officer_bg_check_cpd_enhanced (created 2026-04-24).
--
-- Default OFF — dark launch. Flipped to true 2026-04-25 after PR merge +
-- Vercel deploy + E2E verification.
--
-- ON CONFLICT DO NOTHING (matches CPD-flag pattern): replay-safe — never
-- overwrites an operator-edited description, never resets is_enabled.

INSERT INTO public.feature_flags (flag_key, description, is_enabled, tier_scope)
VALUES (
  'officer_bg_check_nypd_enhanced',
  'Officer Background Check Tier 9: attach NYPD CCRB civilian-complaint history (NYC OpenData, 2000-present, daily refresh) when agency matches NYPD whitelist or state=NY. Sources: nypd_officers + nypd_complaints + nypd_allegations + nypd_penalties.',
  false,
  NULL
)
ON CONFLICT (flag_key) DO NOTHING;
