-- Data waitlist — captures demand for uncovered judges/officers
CREATE TABLE IF NOT EXISTS data_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  search_name text NOT NULL,
  search_state text NOT NULL,
  search_charge_type text,
  email text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  notified_at timestamptz,
  converted_at timestamptz,
  UNIQUE (product_slug, search_name, search_state, email)
);

CREATE INDEX idx_waitlist_status ON data_waitlist (status) WHERE status = 'pending';
CREATE INDEX idx_waitlist_product ON data_waitlist (product_slug, search_state);

ALTER TABLE data_waitlist ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='data_waitlist' AND policyname='service_all') THEN
    CREATE POLICY service_all ON data_waitlist FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
