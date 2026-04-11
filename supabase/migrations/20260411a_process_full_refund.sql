-- Atomic full-refund handler: wraps order update, case update, and commission
-- reversal in a single transaction. Previously these were three separate writes
-- in the webhook handler — if step 1 succeeded but step 2 failed, the order
-- showed "refunded" while the case remained active (report access still open).
--
-- Returns a jsonb payload with all fields the webhook needs for downstream
-- notifications, or { already_processed: true } for idempotent re-delivery.

CREATE OR REPLACE FUNCTION process_full_refund(p_payment_intent_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
  v_order_email text;
  v_order_tier text;
  v_order_amount bigint;
  v_referral_id uuid;
  v_partner_id uuid;
  v_commission_amount bigint;
  v_cases_updated int;
BEGIN
  -- Step 1: Update the order to refunded + revoke all tokens
  UPDATE orders
  SET status = 'refunded',
      refunded_at = NOW(),
      download_token = NULL,
      download_token_expires_at = NULL,
      standalone_report_token_hash = NULL,
      standalone_report_storage_path = NULL,
      standalone_report_token_expires_at = NULL
  WHERE stripe_payment_intent_id = p_payment_intent_id
    AND status = 'paid'  -- Only refund paid orders (idempotency guard)
  RETURNING id, email, tier, amount
  INTO v_order_id, v_order_email, v_order_tier, v_order_amount;

  -- No matching paid order = already refunded or doesn't exist
  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('already_processed', true);
  END IF;

  -- Step 2: Update ALL linked cases to refunded
  -- Includes included deliverables (e.g., IB order refund also marks the
  -- included CD case as "refunded" since they share the same order_id).
  -- Effects: report page returns 403, drip cron skips, upgrade credit voided.
  UPDATE cases
  SET status = 'refunded',
      updated_at = NOW()
  WHERE order_id = v_order_id;

  GET DIAGNOSTICS v_cases_updated = ROW_COUNT;

  -- Step 3: Reverse referral commission (if any)
  -- Zero commission_amount + mark commission_paid=true to exclude from payouts.
  -- Decrement partner running totals with GREATEST to prevent negatives.
  SELECT id, partner_id, commission_amount
  INTO v_referral_id, v_partner_id, v_commission_amount
  FROM referrals
  WHERE order_id = v_order_id
    AND commission_amount > 0
  LIMIT 1;

  IF v_referral_id IS NOT NULL THEN
    -- Decrement partner totals
    UPDATE partners
    SET total_referrals = GREATEST(0, total_referrals - 1),
        total_commission = GREATEST(0, total_commission - v_commission_amount),
        updated_at = NOW()
    WHERE id = v_partner_id;

    -- Zero out the referral commission (referrals table has no updated_at column)
    UPDATE referrals
    SET commission_amount = 0,
        commission_paid = true
    WHERE id = v_referral_id;
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'email', v_order_email,
    'tier', v_order_tier,
    'amount', v_order_amount,
    'cases_updated', v_cases_updated,
    'commission_reversed', v_referral_id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION process_full_refund(text) FROM public;
GRANT EXECUTE ON FUNCTION process_full_refund(text) TO service_role;
