-- 20260425a_attorney_discipline_rls.sql
--
-- T0a (worry-attorney-discipline-wire v2.4): make RLS posture EXPLICIT on the
-- attorney directory + discipline tables. Previously RLS-disabled posture was
-- implicit (anon-key SELECT returned 401 because no anon GRANT existed) — this
-- migration switches both tables to explicit deny-by-default + service_role
-- bypass, matching INAA-web ARCHITECTURE Invariant #4 ("RLS provides
-- defense-in-depth, not primary auth").
--
-- Migration role: applied as `postgres` superuser via the Supabase Mgmt API
-- POST /v1/projects/<ref>/database/query. `postgres` BYPASSES RLS, so this
-- migration succeeds even though no SELECT policy exists. Subsequent
-- service-role queries bypass RLS the same way; anon-key queries are blocked
-- by absence of any policy (deny-by-default).
--
-- Post-apply verification:
--   SELECT relrowsecurity FROM pg_class
--   WHERE relname IN ('attorneys','attorney_discipline_events');
--   Both rows should return `t`.

ALTER TABLE public.attorneys                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attorney_discipline_events  ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS by default — no policy needed for it.
-- anon / authenticated have no SELECT policy → empty result set under PostgREST
-- (HTTP 200 + body `[]`), per Code v2 CRIT #3 verified live 2026-04-25.

COMMENT ON TABLE public.attorneys IS
  'Cross-state attorney directory. RLS enabled 2026-04-25 (T0a worry-attorney-discipline-wire). Service-role only; anon returns 200 + []. See ARCHITECTURE Invariant #4.';

COMMENT ON TABLE public.attorney_discipline_events IS
  'Normalized attorney disciplinary history. RLS enabled 2026-04-25 (T0a worry-attorney-discipline-wire). Service-role only; anon returns 200 + []. See ARCHITECTURE Invariant #4.';
