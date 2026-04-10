-- IDD (Indigent Defendant Direct) scholarship program schema
-- Part of Hybrid Stacking Priority A

-- ── IDD Applications table ──
CREATE TABLE IF NOT EXISTS idd_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Applicant info
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  state text NOT NULL,
  charge_type text NOT NULL,
  situation text NOT NULL, -- free-text description
  -- Means test qualifiers (any YES = qualifies)
  has_public_defender boolean NOT NULL DEFAULT false,
  below_poverty_level boolean NOT NULL DEFAULT false,
  incarcerated_family boolean NOT NULL DEFAULT false,
  -- Processing
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'waitlisted', 'fulfilled', 'declined')),
  approved_product_slug text, -- which product was granted
  decline_reason text,
  order_id uuid REFERENCES orders(id), -- linked order when approved
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text, -- operator identifier
  fulfilled_at timestamptz
);

-- Index for operator queue (pending first, then by date)
CREATE INDEX idx_idd_applications_status ON idd_applications (status, created_at);
CREATE INDEX idx_idd_applications_email ON idd_applications (email);

-- RLS: service_role only (operator access via API routes)
ALTER TABLE idd_applications ENABLE ROW LEVEL SECURITY;

-- ── Atomic counter increment RPC ──
-- Upserts: creates key if missing, increments if exists
CREATE OR REPLACE FUNCTION increment_counter(counter_key text, amount bigint DEFAULT 1)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO counters (key, value)
  VALUES (counter_key, amount)
  ON CONFLICT (key) DO UPDATE
  SET value = counters.value + EXCLUDED.value;
$$;

-- ── Seed scholarship counter keys ──
-- scholarships_total: whole scholarships EARNED by tier purchases (spec sub-task 6)
-- scholarships_fulfilled: scholarships DELIVERED (operator approved + intake started)
-- The delta (total - fulfilled) is the transparent waitlist (spec sub-task 7)
INSERT INTO counters (key, value) VALUES ('scholarships_total', 0) ON CONFLICT (key) DO NOTHING;
INSERT INTO counters (key, value) VALUES ('scholarships_fulfilled', 0) ON CONFLICT (key) DO NOTHING;
INSERT INTO counters (key, value) VALUES ('scholarship_half_credits', 0) ON CONFLICT (key) DO NOTHING;
