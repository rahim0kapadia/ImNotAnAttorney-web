-- platform_post_writer — scoped role for auto-posters (SEC-W4 / P9).
--
-- Motivation: auto-poster scripts (blog-pipeline/scripts/{youtube,twitter-x,
-- instagram,facebook,tiktok}-auto.mjs) currently connect with
-- SUPABASE_SERVICE_ROLE_KEY — full-DB-takeover credential — for a job whose
-- only DB action is INSERT/UPDATE on platform_posts. If that key leaks (SSRF,
-- compromised log, future API-enabled auto-post path), attacker gets every
-- table: orders, cases, discovery, email subscribers, everything.
--
-- Fix: create a NOLOGIN role with GRANT ONLY on platform_posts. Supabase
-- issues a scoped JWT that carries this role via `role` claim. The
-- PostgREST request sets its role to `platform_post_writer` via the JWT,
-- RLS enforces column-level policy, and nothing outside platform_posts is
-- reachable.
--
-- Architecture note: invariant #4 in ARCHITECTURE.md says "Service role
-- only for DB access". This migration is ADDITIVE — it introduces a second
-- server-side JWT-backed role for a specific subsystem (auto-posters).
-- Still no anon-key path. RLS still defense-in-depth for service_role.
-- ARCHITECTURE.md updated in the same commit.
--
-- Plan: C:\Users\email\projects\ImNotAnAttorney\docs\handoff\
--       2026-04-24-unified-container-live-flip.md P9 / apex.md SEC-W4
-- Blast radius: platform_posts only. No other table reachable.
-- JWT issuance: Rahim via Supabase Dashboard → Project Settings → API →
--   generate a new key with `role: platform_post_writer` claim. Paste into
--   ImNotAnAttorney-web/.env.local as SUPABASE_PLATFORM_POSTS_KEY.
--   platform-auto-core.mjs already prefers that env var over the full
--   service-role key (shipped 2026-04-24 Phase X-R2).

-- 1. Create the role. NOLOGIN because JWT authentication replaces password.
--    Idempotent — DO block so re-apply is safe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_post_writer') THEN
    CREATE ROLE platform_post_writer NOLOGIN;
  END IF;
END
$$;

-- 2. Grant minimum privileges. NO SELECT on other tables, NO USAGE on
--    sequences owned by other tables.
GRANT USAGE ON SCHEMA public TO platform_post_writer;
GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_posts TO platform_post_writer;
GRANT USAGE, SELECT ON SEQUENCE public.platform_posts_id_seq TO platform_post_writer;

-- Explicitly deny everything else. Defensive — Postgres default is no-grant,
-- but future migrations that grant to PUBLIC would otherwise leak to this
-- role too. These REVOKEs are no-ops today; kept as a living policy.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM platform_post_writer;
GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_posts TO platform_post_writer;
GRANT USAGE, SELECT ON SEQUENCE public.platform_posts_id_seq TO platform_post_writer;

-- 3. RLS policies. Table already has RLS enabled (per 20260424c). Service
--    role bypasses RLS; platform_post_writer enforces through these policies.

-- 3a. Scoped SELECT (needed for .insert().select('id') RETURNING pattern).
CREATE POLICY platform_post_writer_select
  ON public.platform_posts
  AS PERMISSIVE
  FOR SELECT
  TO platform_post_writer
  USING (true);

-- 3b. Scoped INSERT. Enforces destination shape + non-empty slug to
--     reject obviously-malformed rows at the DB boundary (belt-and-
--     suspenders; SEC-W2 client-side validation already enforces).
CREATE POLICY platform_post_writer_insert
  ON public.platform_posts
  AS PERMISSIVE
  FOR INSERT
  TO platform_post_writer
  WITH CHECK (
    destination IN ('twitter_x','youtube','instagram','facebook','tiktok')
    AND length(charge_type_slug) > 0
    AND length(pain_point_slug) > 0
  );

-- 3c. Scoped UPDATE. Only lets writer update rows it inserted (proxied by
--     "the row is still in pending state" — final-state rows become
--     immutable for this role to prevent a leaked key from rewriting
--     history).
--
--     Note: mark-platform-post.mjs (operator tool) uses the full
--     service-role key, so this policy does NOT need to allow operator
--     terminal-state updates.
CREATE POLICY platform_post_writer_update
  ON public.platform_posts
  AS PERMISSIVE
  FOR UPDATE
  TO platform_post_writer
  USING (status = 'pending')
  WITH CHECK (
    destination IN ('twitter_x','youtube','instagram','facebook','tiktok')
  );

-- 4. Deny DELETE explicitly. No policy for DELETE role → default deny.
--    Row deletion goes through service-role + operator review only.

COMMENT ON ROLE platform_post_writer IS
  'Scoped writer for auto-poster pipeline. GRANT: SELECT/INSERT/UPDATE on platform_posts only. Used instead of service_role to limit blast radius of leaked JWT.';

COMMENT ON POLICY platform_post_writer_insert ON public.platform_posts IS
  'Validates destination + non-empty slugs at DB boundary; client-side SEC-W2 enforces these first, this is defense-in-depth.';

COMMENT ON POLICY platform_post_writer_update ON public.platform_posts IS
  'Only pending rows are mutable by the auto-poster role. Final-state (ok/failed/removed) rows become immutable — operator tools use service-role key for terminal transitions.';
