-- Scheduled Client Check-In System
-- Adds configurable check-in schedule columns to court_reminders and partners.
-- Uses last_prompted_date (single column) instead of unbounded array.
-- Followup columns deferred to v2.

-- Court reminders: check-in schedule columns
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS check_in_days text[];
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS check_in_source text;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS last_prompted_date text;

ALTER TABLE court_reminders ADD CONSTRAINT chk_check_in_source
  CHECK (check_in_source IS NULL OR check_in_source IN ('client', 'partner', 'default'));

-- Partners: default check-in days
ALTER TABLE partners ADD COLUMN IF NOT EXISTS default_check_in_days text[];

-- Indexes for cron queries
CREATE INDEX IF NOT EXISTS idx_court_reminders_check_in_days
  ON court_reminders USING GIN (check_in_days);

CREATE INDEX IF NOT EXISTS idx_check_ins_reminder_date
  ON client_check_ins (court_reminder_id, checked_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_court_reminders_partner_promo
  ON court_reminders (partner_promo_code) WHERE partner_promo_code IS NOT NULL;
