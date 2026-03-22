-- Feature flags for runtime gating (separate from tier.live which controls Stripe routing)
CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  flag_key text NOT NULL UNIQUE,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  tier_scope text[],
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_feature_flags_key ON feature_flags(flag_key);
CREATE INDEX idx_feature_flags_enabled ON feature_flags(flag_key) WHERE is_enabled = true;

INSERT INTO feature_flags (flag_key, description, is_enabled) VALUES
  ('customer-portal', 'Customer my-cases login portal', false),
  ('weekly-progress-emails', 'Weekly case progress emails for War Room+', false),
  ('playbook-upsell-after-score', 'Show playbook upsell on score results page', true);
