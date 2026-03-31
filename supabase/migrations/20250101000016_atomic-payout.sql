-- 016-atomic-payout.sql
-- Atomic payout RPC to prevent race conditions (double-pay) on concurrent payout requests.
-- Also adds expires_at indexes for efficient cleanup cron queries.

CREATE OR REPLACE FUNCTION process_partner_payout(
  p_partner_id uuid,
  p_payment_method text
) RETURNS jsonb AS $$
DECLARE
  v_referral_ids uuid[];
  v_total integer;
  v_payout_id uuid;
BEGIN
  -- Lock and collect unpaid referrals atomically
  SELECT array_agg(id), COALESCE(sum(commission_amount), 0)::integer
  INTO v_referral_ids, v_total
  FROM referrals
  WHERE partner_id = p_partner_id AND commission_paid = false
  FOR UPDATE;

  IF v_referral_ids IS NULL OR array_length(v_referral_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('paid', 0, 'referrals_marked', 0, 'message', 'No unpaid commissions');
  END IF;

  -- Step 1: Create payout record
  INSERT INTO partner_payouts (partner_id, amount, payment_method, referral_ids)
  VALUES (p_partner_id, v_total, p_payment_method, v_referral_ids)
  RETURNING id INTO v_payout_id;

  -- Step 2: Mark referrals as paid
  UPDATE referrals SET commission_paid = true, paid_at = now()
  WHERE id = ANY(v_referral_ids);

  -- Step 3: Increment total_paid_out
  UPDATE partners SET total_paid_out = COALESCE(total_paid_out, 0) + v_total, updated_at = now()
  WHERE id = p_partner_id;

  RETURN jsonb_build_object(
    'paid', v_total,
    'referrals_marked', array_length(v_referral_ids, 1),
    'payout_id', v_payout_id,
    'message', 'Payout recorded'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Restrict SECURITY DEFINER functions to service_role only.
-- These functions bypass RLS; anon/public callers must not invoke them directly.
REVOKE EXECUTE ON FUNCTION process_partner_payout(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION process_partner_payout(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION process_partner_payout(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION consume_magic_link(text) FROM public;
REVOKE EXECUTE ON FUNCTION consume_magic_link(text) FROM anon;
GRANT EXECUTE ON FUNCTION consume_magic_link(text) TO service_role;

REVOKE EXECUTE ON FUNCTION increment_partner_total(uuid, text, integer) FROM public;
REVOKE EXECUTE ON FUNCTION increment_partner_total(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION increment_partner_total(uuid, text, integer) TO service_role;

-- Indexes for efficient session/magic-link cleanup queries
CREATE INDEX IF NOT EXISTS idx_magic_links_expires ON partner_magic_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON partner_sessions(expires_at);
