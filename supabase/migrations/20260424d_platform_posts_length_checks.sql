-- platform_posts length CHECK constraints — Phase X-R1 security-auditor W1.
--
-- Parent migration: 20260424c_platform_posts.sql ships without server-side
-- length limits, relying on client-side validation in
-- blog-pipeline/scripts/lib/platform-auto-core.mjs. Adding belt-and-suspenders
-- CHECK constraints so a client-side bypass (fresh script that skips the new
-- validPostingAccount / validSlug / length guards) can't insert multi-MB
-- rows + bloat the hot-path cluster index.
--
-- 70000 char body cap covers Facebook's 63k limit + safety margin.
-- 2048 char source_url cap is the de-facto Chrome limit.
-- 120 char slug cap aligns with the client-side validSlug regex.
-- 64 char posting_account cap aligns with validPostingAccount regex.
--
-- Plan: docs/handoff/2026-04-24-unified-container-gap-closure.md Phase X.
-- Idempotent: each ADD CONSTRAINT guarded by NOT EXISTS check on pg_constraint.
-- Replay-safe per Brandur Leach migration-safety guidance.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_posts_body_len_chk') THEN
    ALTER TABLE platform_posts
      ADD CONSTRAINT platform_posts_body_len_chk
        CHECK (char_length(posted_body_md) > 0 AND char_length(posted_body_md) <= 70000);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_posts_source_url_len_chk') THEN
    ALTER TABLE platform_posts
      ADD CONSTRAINT platform_posts_source_url_len_chk
        CHECK (source_url IS NULL OR char_length(source_url) <= 2048);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_posts_matched_blog_slug_len_chk') THEN
    ALTER TABLE platform_posts
      ADD CONSTRAINT platform_posts_matched_blog_slug_len_chk
        CHECK (matched_blog_slug IS NULL OR char_length(matched_blog_slug) <= 120);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_posts_posting_account_len_chk') THEN
    ALTER TABLE platform_posts
      ADD CONSTRAINT platform_posts_posting_account_len_chk
        CHECK (posting_account IS NULL OR char_length(posting_account) <= 64);
  END IF;
END $$;

COMMENT ON CONSTRAINT platform_posts_body_len_chk ON platform_posts IS
  'Server-side length CHECK added Phase X-R1 — covers FB 63k cap + safety margin.';
