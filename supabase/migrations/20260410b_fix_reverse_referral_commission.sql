-- Fix: reverse_referral_commission referenced referrals.updated_at which doesn't exist.
-- The referrals table (migration 20250101000012) has only created_at — no updated_at.
-- Every call to this RPC failed with PostgREST error 42703, silently breaking
-- all refund commission reversals.
--
-- This CREATE OR REPLACE removes the `updated_at = NOW()` from the referrals UPDATE
-- while keeping the partners UPDATE (which does have updated_at) unchanged.

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

  -- Mark referral as reversed (referrals table has no updated_at column)
  UPDATE referrals
  SET commission_amount = 0,
      commission_paid = true
  WHERE id = p_referral_id;
END;
$$;

-- Permissions unchanged from original
REVOKE ALL ON FUNCTION reverse_referral_commission(uuid, uuid, bigint) FROM public;
GRANT EXECUTE ON FUNCTION reverse_referral_commission(uuid, uuid, bigint) TO service_role;
