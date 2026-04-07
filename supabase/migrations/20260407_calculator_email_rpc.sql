-- ============================================================
-- increment_calculator_email
-- Non-blocking analytics counter bumped when a calculator result is
-- persisted along with an email address (email-capture step).
--
-- Paired with increment_calculator_aggregate (created in 20260406_
-- standalone_products.sql). That RPC bumps total_calculations per
-- (slug, date); this one bumps emails_captured on the same row.
-- ============================================================
CREATE OR REPLACE FUNCTION increment_calculator_email(p_slug text)
RETURNS void AS $$
BEGIN
  -- Ensure the row exists for today even if no prior calculation was
  -- logged for this slug today. This can happen if a client persists a
  -- result computed in a prior session.
  INSERT INTO calculator_aggregates (slug, date, total_calculations, emails_captured)
  VALUES (p_slug, CURRENT_DATE, 0, 1)
  ON CONFLICT (slug, date) DO UPDATE SET
    emails_captured = calculator_aggregates.emails_captured + 1;
END;
$$ LANGUAGE plpgsql;
