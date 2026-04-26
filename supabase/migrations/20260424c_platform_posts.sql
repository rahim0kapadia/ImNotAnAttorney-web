-- platform_posts — unified post ledger for the five new destinations that
-- are NOT rooted in the abandoned_questions workflow (twitter_x, youtube,
-- instagram, facebook, tiktok). Reddit + quora stay on posted_answers.
--
-- Plan: C:\Users\email\projects\ImNotAnAttorney\docs\handoff\2026-04-24-unified-container-gap-closure.md Phase O
-- Cluster rate-limit + per-account-cap helpers query this table directly
-- via blog-pipeline/lib/cluster-rate-limit.mjs.

CREATE TABLE IF NOT EXISTS platform_posts (
  id                 bigserial   PRIMARY KEY,
  destination        text        NOT NULL CHECK (destination IN ('twitter_x','youtube','instagram','facebook','tiktok')),
  charge_type_slug   text        NOT NULL,
  pain_point_slug    text        NOT NULL,
  source_url         text,
  posted_body_md     text        NOT NULL,
  posted_at          timestamptz NOT NULL DEFAULT now(),
  status             text        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','ok','failed','removed')),
  moderation_status  text        NOT NULL DEFAULT 'pending'
                       CHECK (moderation_status IN ('ok','collapsed','removed','shadowbanned','shadow-suspect','pending')),
  llm_cited          boolean     NOT NULL DEFAULT false,
  click_count        integer     NOT NULL DEFAULT 0,
  posting_account    text,
  matched_blog_slug  text,
  last_checked_at    timestamptz,
  raw_meta           jsonb
);

-- Hot path: cluster-rate-limit query joins (destination, charge, pain, moderation, posted_at DESC).
CREATE INDEX IF NOT EXISTS platform_posts_cluster_idx
  ON platform_posts (destination, charge_type_slug, pain_point_slug, posted_at DESC)
  WHERE moderation_status IN ('pending','ok');

-- Per-account daily cap: (destination, posted_at DESC).
CREATE INDEX IF NOT EXISTS platform_posts_daily_cap_idx
  ON platform_posts (destination, posted_at DESC)
  WHERE moderation_status IN ('pending','ok');

-- Dedupe posts by URL (when the platform returns one).
CREATE UNIQUE INDEX IF NOT EXISTS platform_posts_url_uq
  ON platform_posts (source_url)
  WHERE source_url IS NOT NULL;

-- Moderation sweep: non-ok rows pending re-check.
CREATE INDEX IF NOT EXISTS platform_posts_modstatus_idx
  ON platform_posts (moderation_status, last_checked_at)
  WHERE moderation_status <> 'ok';

-- Attribution back to blog slug.
CREATE INDEX IF NOT EXISTS platform_posts_blog_idx
  ON platform_posts (matched_blog_slug)
  WHERE matched_blog_slug IS NOT NULL;

ALTER TABLE platform_posts ENABLE ROW LEVEL SECURITY;
-- No policies → default deny for anon/authenticated. Service role bypasses RLS.

COMMENT ON TABLE platform_posts IS
  'Every post we publish to Twitter/X, YouTube, Instagram, Facebook, TikTok. Parallel to posted_answers (reddit/quora). Feeds cluster-rate-limit, daily-cap, moderation survival sweep.';

COMMENT ON COLUMN platform_posts.charge_type_slug IS
  'Stored directly on the row (NOT via abandoned_questions) so the cluster-rate-limit helper can filter without an inner join. The five new destinations do discovery + post in a single script, not via the Stage 1D SELECT block used by reddit/quora.';

COMMENT ON COLUMN platform_posts.status IS
  'Post lifecycle — pending (pre-create before API call), ok (API returned success), failed (API returned error), removed (we deleted it manually).';

COMMENT ON COLUMN platform_posts.moderation_status IS
  'Platform moderation outcome — same vocabulary as posted_answers so sibling survival-sweep code can share normalization.';

COMMENT ON COLUMN platform_posts.posting_account IS
  'Handle/channel/page that posted. Lets us split metrics per account during multi-account ramp.';
