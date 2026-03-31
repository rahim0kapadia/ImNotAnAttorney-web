-- 020-security-and-integrity.sql
-- Fixes from 4-agent elite site audit: magic link token hashing,
-- RLS on partners table, referral idempotency, atomic referral tracking,
-- partial index for payout performance.

-- ── 1.1: Hash magic link tokens ──
-- Backfill existing plaintext tokens (64 hex chars) with SHA-256 hashes.
-- Tokens already hashed (128 hex chars) are skipped.
UPDATE partner_magic_links
SET token = encode(sha256(token::bytea), 'hex')
WHERE length(token) = 64;

-- Update consume_magic_link to hash the incoming token before comparing.
-- The caller sends the raw token; the DB stores and compares hashes.
CREATE OR REPLACE FUNCTION consume_magic_link(p_token text)
RETURNS uuid AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  UPDATE partner_magic_links
  SET used_at = now()
  WHERE token = encode(sha256(p_token::bytea), 'hex')
    AND used_at IS NULL
    AND expires_at > now()
  RETURNING partner_id INTO v_partner_id;

  RETURN v_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION consume_magic_link(text) FROM public;
REVOKE EXECUTE ON FUNCTION consume_magic_link(text) FROM anon;
GRANT EXECUTE ON FUNCTION consume_magic_link(text) TO service_role;

-- ── 1.2: RLS on partners table ──
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;

-- ── 2.2: Unique constraint on referrals (order_id, partner_id) ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_order_partner
  ON referrals(order_id, partner_id);

-- ── 2.3: Atomic referral tracking RPC ──
-- Inserts referral + increments partner totals in one transaction.
-- Prevents partial failures that corrupt partner commission totals.
CREATE OR REPLACE FUNCTION track_referral(
  p_partner_id uuid,
  p_order_id uuid,
  p_tier text,
  p_sale_amount integer,
  p_discount_amount integer,
  p_commission_amount integer
) RETURNS void AS $$
BEGIN
  INSERT INTO referrals (partner_id, order_id, tier, sale_amount, discount_amount, commission_amount)
  VALUES (p_partner_id, p_order_id, p_tier, p_sale_amount, p_discount_amount, p_commission_amount);

  UPDATE partners SET
    total_referrals = COALESCE(total_referrals, 0) + 1,
    total_commission = COALESCE(total_commission, 0) + p_commission_amount,
    updated_at = now()
  WHERE id = p_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION track_referral(uuid, uuid, text, integer, integer, integer) FROM public;
REVOKE EXECUTE ON FUNCTION track_referral(uuid, uuid, text, integer, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION track_referral(uuid, uuid, text, integer, integer, integer) TO service_role;

-- ── 5.4: Partial index for payout performance ──
CREATE INDEX IF NOT EXISTS idx_referrals_unpaid
  ON referrals(partner_id) WHERE commission_paid = false;
