-- ============================================================
-- Calculator results table
-- Stores computed results from free calculator tools.
-- Shareable via token URL. Email captured post-result.
-- ============================================================
CREATE TABLE IF NOT EXISTS calculator_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,                    -- "good-time", "sol", "diversion"
  inputs jsonb NOT NULL,                 -- validated form inputs
  result jsonb NOT NULL,                 -- computed output (score, date, eligibility)
  token text,                            -- shareable URL token, null until saved
  email text,                            -- null until user saves results
  subscriber_id uuid REFERENCES subscribers(id),
  charge_type text,                      -- denormalized for analytics
  state text,                            -- denormalized for analytics
  created_at timestamptz DEFAULT now()
);

-- Partial unique index: NULLs are allowed (unsaved results), but tokens must be unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_calculator_results_token
  ON calculator_results(token) WHERE token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calculator_results_slug ON calculator_results(slug);
CREATE INDEX IF NOT EXISTS idx_calculator_results_email ON calculator_results(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calculator_results_created ON calculator_results(created_at);

-- ============================================================
-- NOTE: No standalone_products table — products.ts is sole source of truth
-- ============================================================

-- ============================================================
-- Extend orders table for standalone research products
-- Nullable columns — only populated for standalone product purchases
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS standalone_product_slug text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS standalone_intake_token text;            -- auth token for intake form
ALTER TABLE orders ADD COLUMN IF NOT EXISTS standalone_intake jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS standalone_report_token_hash text;       -- hashed, not raw
ALTER TABLE orders ADD COLUMN IF NOT EXISTS standalone_report_storage_path text;     -- Supabase Storage path, not inline HTML
ALTER TABLE orders ADD COLUMN IF NOT EXISTS standalone_report_token_expires_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS standalone_eval_results jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_standalone_report_token_hash
  ON orders(standalone_report_token_hash) WHERE standalone_report_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_standalone_intake_token
  ON orders(standalone_intake_token) WHERE standalone_intake_token IS NOT NULL;

-- ============================================================
-- Calculator analytics aggregate (like score_aggregates)
-- ============================================================
CREATE TABLE IF NOT EXISTS calculator_aggregates (
  slug text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  total_calculations int DEFAULT 0,
  emails_captured int DEFAULT 0,
  by_state jsonb DEFAULT '{}',          -- {"FL": 42, "CA": 31, ...}
  by_charge_type jsonb DEFAULT '{}',    -- {"dui": 15, "drug": 23, ...}
  PRIMARY KEY (slug, date)
);

-- ============================================================
-- RPC for anonymous calculator analytics (non-blocking upsert)
-- ============================================================
CREATE OR REPLACE FUNCTION increment_calculator_aggregate(
  p_slug text,
  p_state text DEFAULT NULL,
  p_charge_type text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO calculator_aggregates (slug, date, total_calculations, by_state, by_charge_type)
  VALUES (
    p_slug,
    CURRENT_DATE,
    1,
    CASE WHEN p_state IS NOT NULL THEN jsonb_build_object(p_state, 1) ELSE '{}'::jsonb END,
    CASE WHEN p_charge_type IS NOT NULL THEN jsonb_build_object(p_charge_type, 1) ELSE '{}'::jsonb END
  )
  ON CONFLICT (slug, date) DO UPDATE SET
    total_calculations = calculator_aggregates.total_calculations + 1,
    by_state = CASE
      WHEN p_state IS NOT NULL THEN
        calculator_aggregates.by_state || jsonb_build_object(
          p_state,
          COALESCE((calculator_aggregates.by_state ->> p_state)::int, 0) + 1
        )
      ELSE calculator_aggregates.by_state
    END,
    by_charge_type = CASE
      WHEN p_charge_type IS NOT NULL THEN
        calculator_aggregates.by_charge_type || jsonb_build_object(
          p_charge_type,
          COALESCE((calculator_aggregates.by_charge_type ->> p_charge_type)::int, 0) + 1
        )
      ELSE calculator_aggregates.by_charge_type
    END;
END;
$$ LANGUAGE plpgsql;
