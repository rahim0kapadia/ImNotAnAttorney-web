-- 20260417b_partner_events_schedule_denial.sql
-- Widen partner_events.event_type CHECK to include 'schedule_denied_referral_mode'
-- so the PATCH /api/partner/clients/[id]/schedule audit insert (referral-mode
-- denial) does not fail the CHECK constraint.
--
-- Existing allowed values (from 20260414g_partner_growth_upgrades.sql):
--   'link_click', 'quiz_start', 'quiz_complete', 'purchase'
-- Adds:
--   'schedule_denied_referral_mode'
BEGIN;

ALTER TABLE partner_events DROP CONSTRAINT IF EXISTS partner_events_event_type_check;

ALTER TABLE partner_events ADD CONSTRAINT partner_events_event_type_check
  CHECK (event_type IN (
    'link_click',
    'quiz_start',
    'quiz_complete',
    'purchase',
    'schedule_denied_referral_mode'
  ));

COMMIT;
