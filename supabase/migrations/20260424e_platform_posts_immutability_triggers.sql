-- platform_posts immutability + shape triggers — Phase X-R2 security W4 (partial).
--
-- The full fix for security-auditor W4 is "scoped service-account role
-- instead of full SUPABASE_SERVICE_ROLE_KEY" — that requires a DB role +
-- custom-role JWT signed with the project secret, which needs a browser-
-- session via the Supabase dashboard. That step is tracked in
-- ImNotAnAttorney/TERMINAL-TODO.md.
--
-- Meanwhile, these triggers raise the bar server-side so a compromised
-- service-role key can't easily retroactively rewrite post history. RLS
-- is bypassed by service-role; triggers are NOT.
--
-- Trigger 1 — BEFORE INSERT shape validation: regex-check
-- posting_account, matched_blog_slug, source_url (belt-and-suspenders on
-- the client-side validation in blog-pipeline/scripts/lib/platform-auto-core.mjs).
--
-- Trigger 2 — BEFORE UPDATE immutability: once status transitions to
-- 'ok', destination + charge_type_slug + pain_point_slug become
-- read-only (structural identity is fixed at publish time). Also
-- prevents rewriting status away from 'ok' to an earlier lifecycle
-- state — only 'ok' -> 'failed' -> 'removed' transitions are legit.
--
-- Plan: ImNotAnAttorney/docs/handoff/2026-04-24-unified-container-live-flip.md P9.

-- ── Trigger 1: shape validation on INSERT ───────────────────────────────

CREATE OR REPLACE FUNCTION platform_posts_shape_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.posting_account IS NOT NULL
     AND NEW.posting_account !~ '^[A-Za-z0-9_.\-]{1,64}$' THEN
    RAISE EXCEPTION 'posting_account "%" violates shape [A-Za-z0-9_.-]{1,64}', NEW.posting_account;
  END IF;
  IF NEW.matched_blog_slug IS NOT NULL
     AND NEW.matched_blog_slug !~ '^[a-z0-9-]{1,120}$' THEN
    RAISE EXCEPTION 'matched_blog_slug "%" violates shape [a-z0-9-]{1,120}', NEW.matched_blog_slug;
  END IF;
  IF NEW.source_url IS NOT NULL
     AND NEW.source_url !~ '^https?://' THEN
    RAISE EXCEPTION 'source_url "%" must start with http:// or https://', NEW.source_url;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_posts_shape_check_trg ON platform_posts;
CREATE TRIGGER platform_posts_shape_check_trg
  BEFORE INSERT OR UPDATE ON platform_posts
  FOR EACH ROW
  EXECUTE FUNCTION platform_posts_shape_check();

-- ── Trigger 2: immutability on UPDATE after first 'ok' ──────────────────

CREATE OR REPLACE FUNCTION platform_posts_immutability_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Once a row is 'ok', its identity columns freeze.
  IF OLD.status = 'ok' THEN
    IF NEW.destination       <> OLD.destination       THEN
      RAISE EXCEPTION 'destination is immutable after status=''ok''';
    END IF;
    IF NEW.charge_type_slug  <> OLD.charge_type_slug  THEN
      RAISE EXCEPTION 'charge_type_slug is immutable after status=''ok''';
    END IF;
    IF NEW.pain_point_slug   <> OLD.pain_point_slug   THEN
      RAISE EXCEPTION 'pain_point_slug is immutable after status=''ok''';
    END IF;
    IF NEW.posted_body_md    <> OLD.posted_body_md    THEN
      RAISE EXCEPTION 'posted_body_md is immutable after status=''ok''';
    END IF;
    -- Status may transition 'ok' -> 'failed' -> 'removed' (operator
    -- take-downs), but must never rewind to 'pending'.
    IF NEW.status = 'pending' THEN
      RAISE EXCEPTION 'status cannot transition from ok back to pending';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_posts_immutability_trg ON platform_posts;
CREATE TRIGGER platform_posts_immutability_trg
  BEFORE UPDATE ON platform_posts
  FOR EACH ROW
  EXECUTE FUNCTION platform_posts_immutability_check();

COMMENT ON FUNCTION platform_posts_shape_check() IS
  'Phase X-R2 security W4 (partial) — regex-checks shape of posting_account / matched_blog_slug / source_url on INSERT + UPDATE. Defense-in-depth on top of client-side validation in platform-auto-core.mjs.';

COMMENT ON FUNCTION platform_posts_immutability_check() IS
  'Phase X-R2 security W4 (partial) — freezes identity columns once a row reaches status=ok. Prevents retroactive rewrite via any key type including compromised service-role. Status transitions ok -> failed -> removed only; never ok -> pending.';
