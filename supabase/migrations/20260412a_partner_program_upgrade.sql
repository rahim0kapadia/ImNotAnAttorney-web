-- Partner program best-in-class upgrade
-- New columns, updated track_referral RPC with tier evaluation, partner_analytics RPC

-- 1. New columns on partners
ALTER TABLE partners ADD COLUMN IF NOT EXISTS commission_tier text DEFAULT 'partner';
ALTER TABLE partners ADD COLUMN IF NOT EXISTS payment_paypal text;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS activation_email_sent_at timestamptz;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS last_activation_email_key text;

-- 2. New column on referrals
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS sub_id text;

-- 3. Drip cron index
CREATE INDEX IF NOT EXISTS idx_partners_activation_drip
  ON partners (status, activation_email_sent_at)
  WHERE status = 'approved';

-- 4. Updated track_referral: adds sub_id param + atomic tier evaluation
DROP FUNCTION IF EXISTS track_referral(uuid, uuid, text, bigint, bigint, bigint);

CREATE OR REPLACE FUNCTION track_referral(
  p_partner_id uuid, p_order_id uuid, p_tier text,
  p_sale_amount bigint, p_discount_amount bigint,
  p_commission_amount bigint, p_sub_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_total integer;
  v_old_tier text;
  v_new_tier text;
  v_new_rate integer;
  v_inserted boolean := false;
BEGIN
  INSERT INTO referrals (partner_id, order_id, tier, sale_amount, discount_amount, commission_amount, sub_id)
  VALUES (p_partner_id, p_order_id, p_tier, p_sale_amount, p_discount_amount, p_commission_amount, p_sub_id)
  ON CONFLICT (order_id, partner_id) DO NOTHING
  RETURNING true INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('tier_changed', false, 'duplicate', true);
  END IF;

  UPDATE partners SET
    total_referrals = total_referrals + 1,
    total_commission = total_commission + p_commission_amount
  WHERE id = p_partner_id
  RETURNING total_referrals, commission_tier INTO v_new_total, v_old_tier;

  v_new_tier := CASE
    WHEN v_new_total >= 15 THEN 'gold'
    WHEN v_new_total >= 5 THEN 'silver'
    ELSE 'partner'
  END;
  v_new_rate := CASE v_new_tier
    WHEN 'gold' THEN 20
    WHEN 'silver' THEN 15
    ELSE 10
  END;

  IF v_new_tier != v_old_tier AND v_new_rate > (SELECT commission_rate FROM partners WHERE id = p_partner_id) THEN
    UPDATE partners SET commission_tier = v_new_tier, commission_rate = v_new_rate
    WHERE id = p_partner_id;
    RETURN jsonb_build_object('tier_changed', true, 'new_tier', v_new_tier, 'new_rate', v_new_rate);
  END IF;

  RETURN jsonb_build_object('tier_changed', false, 'new_tier', COALESCE(v_old_tier, 'partner'));
END;
$$;

REVOKE ALL ON FUNCTION track_referral(uuid, uuid, text, bigint, bigint, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION track_referral(uuid, uuid, text, bigint, bigint, bigint, text) TO service_role;

-- 5. Partner analytics RPC
CREATE OR REPLACE FUNCTION partner_analytics(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_monthly jsonb;
  v_by_tier jsonb;
  v_total_count integer;
BEGIN
  SELECT jsonb_agg(row_to_json(m)) INTO v_monthly FROM (
    SELECT date_trunc('month', created_at)::date AS month,
           SUM(commission_amount) AS commission,
           COUNT(*) AS count
    FROM referrals WHERE partner_id = p_partner_id
    GROUP BY 1 ORDER BY 1 DESC LIMIT 12
  ) m;

  SELECT jsonb_agg(row_to_json(t)) INTO v_by_tier FROM (
    SELECT tier, SUM(commission_amount) AS commission, COUNT(*) AS count
    FROM referrals WHERE partner_id = p_partner_id
    GROUP BY 1 ORDER BY 2 DESC
  ) t;

  SELECT COUNT(*) INTO v_total_count
  FROM referrals WHERE partner_id = p_partner_id;

  RETURN jsonb_build_object(
    'monthly', COALESCE(v_monthly, '[]'::jsonb),
    'by_tier', COALESCE(v_by_tier, '[]'::jsonb),
    'total_referrals', v_total_count
  );
END;
$$;

REVOKE ALL ON FUNCTION partner_analytics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION partner_analytics(uuid) TO service_role;
