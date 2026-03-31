-- ============================================================
-- 015: Partner Portal Fixes
-- Addresses security + data integrity issues from code review.
-- ============================================================

-- ── C2 fix: Atomic magic link consumption (TOCTOU race) ──
-- Replaces the SELECT-then-UPDATE pattern with a single atomic operation.
-- Returns the partner_id if the token is valid and unused, NULL otherwise.
CREATE OR REPLACE FUNCTION consume_magic_link(p_token text)
RETURNS uuid AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  UPDATE partner_magic_links
  SET used_at = now()
  WHERE token = p_token
    AND used_at IS NULL
    AND expires_at > now()
  RETURNING partner_id INTO v_partner_id;

  RETURN v_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── C5 fix: Add heard_about_us column to partner_applications ──
ALTER TABLE partner_applications ADD COLUMN IF NOT EXISTS heard_about_us text;

-- ── W3 fix: Replace increment_partner_total with allowlist-validated version ──
-- Prevents arbitrary column updates via SQL injection in the p_column parameter.
CREATE OR REPLACE FUNCTION increment_partner_total(
  p_partner_id uuid,
  p_column text,
  p_amount integer
) RETURNS void AS $$
BEGIN
  IF p_column NOT IN ('total_referrals', 'total_commission', 'total_paid_out') THEN
    RAISE EXCEPTION 'Invalid column: %', p_column;
  END IF;

  EXECUTE format(
    'UPDATE partners SET %I = COALESCE(%I, 0) + $1, updated_at = now() WHERE id = $2',
    p_column, p_column
  ) USING p_amount, p_partner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── S4: Note for future cleanup cron ──
-- TODO: Create a cron job to clean up expired partner_sessions and
-- used/expired partner_magic_links (e.g., DELETE WHERE expires_at < now() - interval '7 days').
