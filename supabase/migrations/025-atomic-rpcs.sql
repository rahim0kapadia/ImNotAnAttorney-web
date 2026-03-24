-- P2-21: Atomic commission reversal (eliminates optimistic-locking race condition)
-- Called from webhook refund handler. Decrements partner totals and marks referral reversed.
CREATE OR REPLACE FUNCTION reverse_referral_commission(
  p_referral_id uuid,
  p_partner_id uuid,
  p_commission_amount bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Atomically decrement partner totals (GREATEST prevents negative)
  UPDATE partners
  SET total_referrals = GREATEST(0, total_referrals - 1),
      total_commission = GREATEST(0, total_commission - p_commission_amount),
      updated_at = NOW()
  WHERE id = p_partner_id;

  -- Mark referral as reversed
  UPDATE referrals
  SET commission_amount = 0,
      commission_paid = true,
      updated_at = NOW()
  WHERE id = p_referral_id;
END;
$$;

-- Lock down: only service_role can call this
REVOKE ALL ON FUNCTION reverse_referral_commission(uuid, uuid, bigint) FROM public;
GRANT EXECUTE ON FUNCTION reverse_referral_commission(uuid, uuid, bigint) TO service_role;


-- P2-23: Sum paid revenue without fetching all rows client-side
CREATE OR REPLACE FUNCTION sum_paid_revenue()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(amount), 0)::bigint FROM orders WHERE status = 'paid';
$$;

REVOKE ALL ON FUNCTION sum_paid_revenue() FROM public;
GRANT EXECUTE ON FUNCTION sum_paid_revenue() TO service_role;
