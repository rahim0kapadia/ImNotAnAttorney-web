-- Task 32 (bondsman modes v2): seeded partners for E2E specs.
--
-- Idempotent via ON CONFLICT on email. Safe to re-run.
--
-- Fixtures:
--   E2EBOND  — check_in_enabled=true  — drives checkin-signup.spec.ts
--   E2EREFE  — check_in_enabled=false — drives bridge-referral.spec.ts
-- Both are also used by og-preview.spec.ts.
--
-- Apply via: node scripts/seed-e2e-partners.mjs
-- Gate specs on: E2E_SEED_READY=1

INSERT INTO partners (name, email, status, promo_code, commission_rate, source, check_in_enabled)
VALUES ('E2E Check-In Bondsman', 'e2e-checkin@example.com', 'approved', 'E2EBOND', 10, 'bondsman', true)
ON CONFLICT (email) DO UPDATE SET check_in_enabled = EXCLUDED.check_in_enabled, status = 'approved';

INSERT INTO partners (name, email, status, promo_code, commission_rate, source, check_in_enabled)
VALUES ('E2E Referral Bondsman', 'e2e-referral@example.com', 'approved', 'E2EREFE', 10, 'bondsman', false)
ON CONFLICT (email) DO UPDATE SET check_in_enabled = EXCLUDED.check_in_enabled, status = 'approved';
