-- TCPA defense enrichment on court_reminders.
--
-- Problem: sms_consent_at captures WHEN consent was given but nothing about
-- the device or session that granted it. If a defendant later claims "I never
-- gave consent" in a TCPA challenge, timestamp alone is weak evidence.
--
-- Fix: store the request IP + User-Agent at consent time, immutable audit
-- trail. Populated only when phone is present + consent===true (see
-- src/app/api/court-reminders/route.ts). Both columns nullable — historical
-- rows predate this enrichment, and non-SMS enrollments never populate them.
--
-- PII class: restricted. The partner dashboard query in
-- src/app/api/partner/dashboard/route.ts explicitly selects a column
-- allowlist that does NOT include these fields; RLS already blocks anon.
-- No new partner-surface exposure.
--
-- C5 from docs/plans/2026-04-20-quality-gate-deferred-fixes.md.

ALTER TABLE court_reminders
  ADD COLUMN IF NOT EXISTS consent_ip text,
  ADD COLUMN IF NOT EXISTS consent_user_agent text;

COMMENT ON COLUMN court_reminders.consent_ip IS
  'Request IP at SMS-consent time. TCPA audit. Nullable when no phone/consent.';

COMMENT ON COLUMN court_reminders.consent_user_agent IS
  'Request User-Agent at SMS-consent time. TCPA audit. Nullable when no phone/consent. Capped at 512 chars at insert time.';
