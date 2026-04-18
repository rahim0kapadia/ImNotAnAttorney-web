-- 20260417a_partner_check_in_enabled.sql
-- Adds partners.check_in_enabled + partners.flip_at for bondsman-modes v2.
-- Bondsmen default to check_in_enabled=true (no behavior change).
-- Non-bondsmen backfilled to false (they never ran check-ins).
-- Pre-migration sanity (scripts/sanity-bondsman-modes.mjs) must return zero rows.
BEGIN;

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS check_in_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS flip_at timestamptz NULL;

UPDATE partners
  SET check_in_enabled = false
  WHERE source IS NULL OR source != 'bondsman';

COMMENT ON COLUMN partners.check_in_enabled IS
  'Per-partner operational mode. true=check-in mode. false=referral mode. Backfilled false for non-bondsmen on 2026-04-17.';
COMMENT ON COLUMN partners.flip_at IS
  'Last mode-flip timestamp. Drives FlipBanner visibility for 14 days post-flip. Set server-side by settings PATCH.';

COMMIT;
