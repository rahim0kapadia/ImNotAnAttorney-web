CREATE TABLE IF NOT EXISTS content_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_slug text NOT NULL,
  content_post_id integer REFERENCES content_posts(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'flagged'
    CHECK (status IN ('flagged', 'queued', 'regenerated', 'published', 'skipped')),
  original_performance jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_content_revisions_status ON content_revisions(status);
CREATE INDEX idx_content_revisions_slug ON content_revisions(blog_slug);

CREATE TRIGGER update_content_revisions_updated_at
  BEFORE UPDATE ON content_revisions
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE content_revisions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE content_revisions IS 'Tracks underperforming posts flagged for regeneration by the feedback loop';
