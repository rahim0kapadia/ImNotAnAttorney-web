-- 014: Partner Portal — magic links, sessions, payouts, payment info
-- Supports: partner self-service dashboard, magic link auth, payout history

-- ── Magic link tokens for partner authentication ──
CREATE TABLE partner_magic_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_partner_magic_links_token ON partner_magic_links(token);

-- ── Partner sessions (supports multi-device) ──
CREATE TABLE partner_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  session_token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_partner_sessions_token ON partner_sessions(session_token);

-- ── Payout history ──
CREATE TABLE partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id),
  amount integer NOT NULL,            -- cents
  payment_method text NOT NULL,       -- 'zelle' | 'venmo' | 'check'
  referral_ids uuid[] NOT NULL,       -- which referrals were included
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_partner_payouts_partner ON partner_payouts(partner_id);

-- ── Payment info columns on partners ──
ALTER TABLE partners ADD COLUMN IF NOT EXISTS preferred_payment_method text;   -- 'zelle' | 'venmo' | 'check'
ALTER TABLE partners ADD COLUMN IF NOT EXISTS payment_zelle text;             -- email or phone
ALTER TABLE partners ADD COLUMN IF NOT EXISTS payment_venmo text;             -- venmo handle
ALTER TABLE partners ADD COLUMN IF NOT EXISTS payment_check_address text;     -- mailing address

-- ── Source tracking on partner applications ──
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS source text;        -- 'bondsman' | 'generic' | null

-- ── Unique partial index on promo_code (allows NULLs, prevents duplicate codes) ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_promo_unique
  ON partners(promo_code) WHERE promo_code IS NOT NULL;

-- ── RPC: Atomic partner total increments ──
-- Used by: payout handler (total_paid_out), webhook (total_referrals, total_commission)
-- Follows the existing increment_counter pattern from migration 012.
CREATE OR REPLACE FUNCTION increment_partner_total(
  p_partner_id uuid,
  p_column text,
  p_amount integer
) RETURNS void AS $$
BEGIN
  EXECUTE format(
    'UPDATE partners SET %I = COALESCE(%I, 0) + $1, updated_at = now() WHERE id = $2',
    p_column, p_column
  ) USING p_amount, p_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
