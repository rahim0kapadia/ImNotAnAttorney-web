-- Layer 2 of SMS delivery monitoring: bounce-triggered suspensions.
-- When Resend reports a bounce on a {phone}@text.email address, we record a
-- suspension here. sendSMS() checks this table before every send and skips if
-- an active (resolved_at IS NULL) row exists for the recipient.
--
-- Distinct from court_reminders.sms_consent_at / partners.sms_consent_at:
--   - sms_consent_at = user-granted 10DLC consent. Revoking = user choice.
--   - sms_suspensions = delivery-failure signal. Auto-populated from webhook.
-- Keeping them separate preserves an audit trail when support asks
-- "why did SMS stop going to this client?"

CREATE TABLE IF NOT EXISTS sms_suspensions (
  phone text PRIMARY KEY,
  suspended_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  bounce_type text,
  source text NOT NULL DEFAULT 'resend_webhook',
  metadata jsonb,
  resolved_at timestamptz,
  resolved_by text
);

-- Partial index for the hot path — active suspension lookup on send.
CREATE INDEX IF NOT EXISTS sms_suspensions_active_phone_idx
  ON sms_suspensions (phone)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE sms_suspensions IS
  'Auto-suspension of SMS sends after gateway bounce (e.g. {phone}@text.email rejection). Populated by /api/webhooks/resend. Read by sendSMS() pre-flight.';
