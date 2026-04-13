-- Court reminders platform — free court prep for partner-referred defendants
-- Stores sign-ups, tracks reminder delivery, links to partner for attribution.

CREATE TABLE IF NOT EXISTS court_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  first_name text NOT NULL,
  email text NOT NULL,
  charge_type text NOT NULL,
  county_state text NOT NULL,
  court_date date NOT NULL,
  recommended_tier text,
  partner_promo_code text,
  status text NOT NULL DEFAULT 'active',
  reminders_sent text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  converted_at timestamptz,
  order_id uuid
);

-- Cron query: find active reminders approaching court date
CREATE INDEX IF NOT EXISTS idx_court_reminders_active_date
  ON court_reminders (status, court_date)
  WHERE status = 'active';

-- Prep page lookup by token
CREATE INDEX IF NOT EXISTS idx_court_reminders_token
  ON court_reminders (token);

-- Partner dashboard: count sign-ups per partner
CREATE INDEX IF NOT EXISTS idx_court_reminders_partner
  ON court_reminders (partner_promo_code)
  WHERE partner_promo_code IS NOT NULL;
