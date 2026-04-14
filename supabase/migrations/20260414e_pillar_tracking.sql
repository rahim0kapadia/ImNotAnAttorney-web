-- 20260414e_pillar_tracking.sql
-- Content Pillar Engine (C2-C4): pillar tagging + conversion attribution

ALTER TABLE content_gaps ADD COLUMN IF NOT EXISTS pillar_slug text;
ALTER TABLE blog_drafts ADD COLUMN IF NOT EXISTS pillar_slug text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pillar_ref text;

CREATE INDEX IF NOT EXISTS idx_content_gaps_pillar ON content_gaps(pillar_slug) WHERE pillar_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_drafts_pillar ON blog_drafts(pillar_slug) WHERE pillar_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_pillar_ref ON orders(pillar_ref) WHERE pillar_ref IS NOT NULL;
