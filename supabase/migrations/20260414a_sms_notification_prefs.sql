-- supabase/migrations/20260414a_sms_notification_prefs.sql
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz;
ALTER TABLE court_reminders ADD COLUMN IF NOT EXISTS notification_prefs jsonb;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS notification_prefs jsonb;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS locked_at timestamptz;

-- SMS audit log (mirrors email_log pattern)
CREATE TABLE IF NOT EXISTS sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  body text,
  category text NOT NULL,
  court_reminder_id uuid REFERENCES court_reminders(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;
-- Deny anon/authenticated — only service_role writes via createAdminClient()
CREATE POLICY "sms_log_deny_all" ON sms_log FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS idx_sms_log_recipient ON sms_log(recipient);
CREATE INDEX IF NOT EXISTS idx_sms_log_category ON sms_log(category);
