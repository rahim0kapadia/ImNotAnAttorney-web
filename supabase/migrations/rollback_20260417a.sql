-- Rollback for 20260417a_partner_check_in_enabled.sql
BEGIN;
ALTER TABLE partners DROP COLUMN IF EXISTS check_in_enabled;
ALTER TABLE partners DROP COLUMN IF EXISTS flip_at;
COMMIT;
