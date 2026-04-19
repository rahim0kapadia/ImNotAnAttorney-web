-- Rollback for 20260417b_partner_events_schedule_denial.sql
-- Reverts partner_events.event_type CHECK to the pre-20260417b clause
-- (original 20260414g values only: link_click, quiz_start, quiz_complete, purchase).
-- NOTE: if any partner_events rows with event_type='schedule_denied_referral_mode'
-- exist at rollback time, the ADD CONSTRAINT will FAIL (CHECK violation). Purge
-- or reclassify those rows before running this rollback.
BEGIN;

ALTER TABLE partner_events DROP CONSTRAINT IF EXISTS partner_events_event_type_check;

ALTER TABLE partner_events ADD CONSTRAINT partner_events_event_type_check
  CHECK (event_type IN (
    'link_click',
    'quiz_start',
    'quiz_complete',
    'purchase'
  ));

COMMIT;
