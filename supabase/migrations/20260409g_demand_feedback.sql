-- demand_feedback: stores per-charge-type feedback signals that the generation
-- pipeline consumes to improve topic selection, prompt guidance, and QA thresholds.

CREATE TABLE IF NOT EXISTS demand_feedback (
  charge_type_slug text PRIMARY KEY,
  performance_multiplier numeric(4,2) NOT NULL DEFAULT 1.0,
  winning_patterns jsonb NOT NULL DEFAULT '{}',
  qa_humanizer_threshold integer NOT NULL DEFAULT 45,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger for updated_at
CREATE TRIGGER update_demand_feedback_updated_at
  BEFORE UPDATE ON demand_feedback
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE demand_feedback ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE demand_feedback IS 'Per-charge-type feedback signals consumed by blog generation pipeline';
COMMENT ON COLUMN demand_feedback.performance_multiplier IS 'Multiplier (0.5-2.0) applied to gap_score in score-demand.ts. Higher = more content generated for this charge type.';
COMMENT ON COLUMN demand_feedback.winning_patterns IS 'Structural features extracted from top-performing posts (question density, opening pattern, etc.)';
COMMENT ON COLUMN demand_feedback.qa_humanizer_threshold IS 'Adaptive humanizer pass threshold (floor 25, ceiling 55, default 45)';
