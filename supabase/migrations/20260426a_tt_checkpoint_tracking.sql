-- TikTok 2026-07-23 checkpoint tracking infra (P3 from work order).
--
-- Per APEX-W2 in 20b3606, three hard gates must clear by 2026-07-23 before
-- the TT defer is lifted:
--   Gate A: >=50 /score completions attributable to YT or X within last
--           90d AND >=1 paid conversion
--   Gate B: zero content-removal strikes on YT or X
--   Gate C: cached .01% expert for TT-legal passes 3-angle triangulation
--
-- This migration ships:
--   1. score_completions (privacy-first, no PII; tracks attribution_source
--      so Gate A can be computed from a single SQL count)
--   2. content_removal_incidents (Gate B incident log; written by the
--      log-content-removal.mjs CLI)
--   3. tt_checkpoint_state (cron singleton; tracks last alert time so
--      we don't spam Telegram every 24h once the gate trips)
--
-- Privacy posture: score_completions stores ZERO answers, ZERO email,
-- ZERO IP. Only charge_type (already public-aggregate-grade), the score
-- band, and the attribution_source string. Same threat model as the
-- existing counters / score_aggregates RPCs.

-- 1. score_completions ------------------------------------------------------
-- One row per /api/score POST. Anonymous, no PII.
CREATE TABLE IF NOT EXISTS score_completions (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  charge_type text        NOT NULL,
  score_value integer     NOT NULL CHECK (score_value >= 0 AND score_value <= 100),
  score_band  text        NOT NULL CHECK (score_band IN ('Critical','Concerning','Average','Adequate','Excellent')),
  -- attribution_source: classification bucket
  attribution_source text  CHECK (
    attribution_source IS NULL
    OR attribution_source IN (
      'youtube','x','twitter_x','tiktok','instagram','facebook',
      'reddit','quora','google','bing','organic','direct','other'
    )
  ),
  -- referrer_host: parsed hostname only (path would be PII).
  referrer_host text       CHECK (referrer_host IS NULL OR length(referrer_host) <= 253),
  -- matched_blog_slug: optional source post; lets us join to platform_posts.
  matched_blog_slug text   CHECK (matched_blog_slug IS NULL OR matched_blog_slug ~ '^[a-z0-9-]{1,120}$')
);

CREATE INDEX IF NOT EXISTS idx_score_completions_attribution_recent
  ON score_completions (attribution_source, created_at DESC)
  WHERE attribution_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_score_completions_created_at
  ON score_completions (created_at DESC);

ALTER TABLE score_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY score_completions_service_all ON score_completions
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE score_completions IS
  'Anonymous /api/score completion log. NO PII. Powers Gate A of the TikTok 2026-07-23 checkpoint (>=50 YT/X-attributed completions in 90d).';

-- 2. content_removal_incidents ----------------------------------------------
-- Manual log written by scripts/log-content-removal.mjs.
CREATE TABLE IF NOT EXISTS content_removal_incidents (
  id              bigserial PRIMARY KEY,
  reported_at     timestamptz NOT NULL DEFAULT now(),
  occurred_at     timestamptz NOT NULL,
  platform        text        NOT NULL CHECK (platform IN (
    'youtube','x','twitter_x','tiktok','instagram','facebook','other'
  )),
  -- platform_post_id links to platform_posts.id when known; NULL otherwise.
  platform_post_id integer REFERENCES platform_posts(id) ON DELETE SET NULL,
  source_url      text        CHECK (source_url IS NULL OR length(source_url) <= 2048),
  reason_code     text        NOT NULL CHECK (reason_code IN (
    'community_guidelines','copyright','spam','misinformation',
    'harassment','privacy','minor_safety','sensitive','manual','other'
  )),
  notes           text        CHECK (notes IS NULL OR length(notes) <= 4000),
  resolved_at     timestamptz,
  resolved_by     text        CHECK (resolved_by IS NULL OR length(resolved_by) <= 64),
  resolution_note text        CHECK (resolution_note IS NULL OR length(resolution_note) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_content_removal_platform_recent
  ON content_removal_incidents (platform, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_removal_unresolved
  ON content_removal_incidents (platform, occurred_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE content_removal_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_removal_service_all ON content_removal_incidents
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE content_removal_incidents IS
  'Operator-logged content strikes on social platforms. Powers Gate B of the TikTok 2026-07-23 checkpoint (zero unresolved strikes on YT/X in the 90-day window).';

-- 3. tt_checkpoint_state ----------------------------------------------------
-- Cron singleton. Tracks last-run + last-alert so the cron does not
-- re-Telegram the same threshold cross every 24h.
CREATE TABLE IF NOT EXISTS tt_checkpoint_state (
  id                            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_run_at                   timestamptz,
  last_run_count_youtube        integer NOT NULL DEFAULT 0,
  last_run_count_x              integer NOT NULL DEFAULT 0,
  last_run_paid_conversions     integer NOT NULL DEFAULT 0,
  last_run_strikes_unresolved   integer NOT NULL DEFAULT 0,
  gate_a_first_passed_at        timestamptz,
  gate_a_alert_sent_at          timestamptz,
  gate_b_last_strike_at         timestamptz,
  gate_c_last_triangulated_at   timestamptz,
  notes                         text     CHECK (notes IS NULL OR length(notes) <= 4000)
);

INSERT INTO tt_checkpoint_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE tt_checkpoint_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY tt_checkpoint_state_service_all ON tt_checkpoint_state
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE tt_checkpoint_state IS
  'Singleton state row for /api/cron/tt-checkpoint. Tracks last computed Gate A/B/C state so re-runs do not duplicate Telegram alerts.';
