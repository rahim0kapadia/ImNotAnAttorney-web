-- E2E fixture rows. Safe to delete via scripts/teardown-e2e-partners.mjs.
--
-- Task 32 (bondsman modes v2): seeded partners for E2E specs.
--
-- Idempotent via ON CONFLICT on email. Safe to re-run.
--
-- Fixtures:
--   E2EBOND  — check_in_enabled=true  — drives checkin-signup.spec.ts
--   E2EREFE  — check_in_enabled=false — drives bridge-referral.spec.ts
-- Both are also used by og-preview.spec.ts.
--
-- Apply via: E2E_SEED_CONFIRMED=1 node scripts/seed-e2e-partners.mjs
-- Gate specs on: E2E_SEED_READY=1

BEGIN;

-- Company names set to plausible bail-bond-business strings so real visitors
-- who hit these fixture URLs (bondsmen testing their link, QA, demos) see a
-- believable partner brand instead of "Test Bondsman Co" — the 2026-04-21
-- adversarial walkthrough flagged the placeholder as a direct close-the-tab
-- trigger for the crisis buyer.
INSERT INTO partners (name, company, email, status, promo_code, commission_rate, source, check_in_enabled)
VALUES ('Jordan Brooks', 'Gulf Coast Bail Bonds', 'e2e-checkin@example.com', 'approved', 'E2EBOND', 10, 'bondsman', true)
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  company = EXCLUDED.company,
  check_in_enabled = EXCLUDED.check_in_enabled,
  status = 'approved';

INSERT INTO partners (name, company, email, status, promo_code, commission_rate, source, check_in_enabled)
VALUES ('Marcus Ellis', 'Clearwater Bail Bonds', 'e2e-referral@example.com', 'approved', 'E2EREFE', 10, 'bondsman', false)
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  company = EXCLUDED.company,
  check_in_enabled = EXCLUDED.check_in_enabled,
  status = 'approved';

COMMIT;
