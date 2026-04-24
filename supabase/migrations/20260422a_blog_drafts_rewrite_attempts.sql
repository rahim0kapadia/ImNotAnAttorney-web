-- Blog QA loop: separate rewrite-attempts counter from qa-attempts.
--
-- qa_attempts counts QA gate runs. After adding the blog_rewrite worker
-- (engine commit e54ccd8), each QA fail can trigger a rewrite which
-- updates the draft's MDX in place. Conflating QA-runs and rewrite-cycles
-- in the same counter makes the decline budget arbitrary — a draft that
-- got 2 QA runs before the rewriter existed has only 1 rewrite cycle
-- left, which is too few to converge.
--
-- New column rewrite_attempts tracks ONLY the rewrite cycles. Decline
-- triggers when rewrite_attempts >= MAX_REWRITE_ATTEMPTS (configured in
-- engine). Default MAX_REWRITE_ATTEMPTS = 3, giving up to 4 QA runs total
-- (1 initial + 3 post-rewrite).

ALTER TABLE blog_drafts
  ADD COLUMN IF NOT EXISTS rewrite_attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN blog_drafts.rewrite_attempts IS
  'Count of blog_rewrite worker invocations on this draft. Distinct from qa_attempts (which counts QA gate runs). Decline triggers when this >= MAX_REWRITE_ATTEMPTS in the engine.';
