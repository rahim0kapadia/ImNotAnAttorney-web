-- Score results for shareable URLs.
-- Only populated when a user clicks "Share" (lazy persistence).
-- Privacy-first: no user_id, no email, no IP. Anonymous by design.

CREATE TABLE score_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  charge_type text NOT NULL,
  score_value integer NOT NULL CHECK (score_value >= 0 AND score_value <= 100),
  score_band text NOT NULL CHECK (score_band IN ('Critical', 'Concerning', 'Average', 'Adequate', 'Excellent')),
  observations jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '90 days',
  view_count integer DEFAULT 0
);

CREATE INDEX idx_score_results_token ON score_results(token);
CREATE INDEX idx_score_results_expires ON score_results(expires_at);
