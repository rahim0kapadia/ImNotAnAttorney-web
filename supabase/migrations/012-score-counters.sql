-- Migration 012: Score completion counter + anonymous aggregate tracking
-- Supports the Defense Accountability Index (proprietary data moat)

-- ============================================================
-- COUNTERS TABLE — generic atomic counter infrastructure
-- ============================================================
CREATE TABLE IF NOT EXISTS counters (
  id TEXT PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the score completions counter
INSERT INTO counters (id, value) VALUES ('score_completions', 0)
ON CONFLICT (id) DO NOTHING;

-- Atomic increment RPC — returns new value after increment
CREATE OR REPLACE FUNCTION increment_counter(p_id TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  new_val BIGINT;
BEGIN
  UPDATE counters
  SET value = value + 1, updated_at = now()
  WHERE id = p_id
  RETURNING value INTO new_val;

  IF new_val IS NULL THEN
    INSERT INTO counters (id, value) VALUES (p_id, 1)
    ON CONFLICT (id) DO UPDATE SET value = counters.value + 1, updated_at = now()
    RETURNING value INTO new_val;
  END IF;

  RETURN new_val;
END;
$$;

-- ============================================================
-- SCORE AGGREGATES — anonymous metrics by charge type
-- NO individual answers stored. Only aggregate counts.
-- ============================================================
CREATE TABLE IF NOT EXISTS score_aggregates (
  charge_type TEXT NOT NULL,
  metric TEXT NOT NULL,
  count BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (charge_type, metric)
);

-- Atomic increment for score aggregates
CREATE OR REPLACE FUNCTION increment_score_aggregate(p_charge_type TEXT, p_metric TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO score_aggregates (charge_type, metric, count)
  VALUES (p_charge_type, p_metric, 1)
  ON CONFLICT (charge_type, metric)
  DO UPDATE SET count = score_aggregates.count + 1;
END;
$$;
