-- 20260425c_attorney_unaccent.sql
--
-- T1.1a + T1.2 RPC (worry-attorney-discipline-wire v2.4):
-- 1) install `unaccent` extension
-- 2) wrap as IMMUTABLE function (`unaccent` itself is STABLE; indexes need IMMUTABLE)
-- 3) create expression index over (jurisdiction, lower(immutable_unaccent(full_name)))
-- 4) create stored RPC `attorney_match_by_raw_name` for service-role-only access
--
-- Why immutable wrapper: STABLE functions can't be used in expression indexes.
-- Why pin dictionary: pg_dict_unaccent ('unaccent') is the default; pinning matches
--   the index's frozen dictionary so behavior is deterministic.
-- Why two-arg form: unaccent(regdictionary, text) — the dictionary name MUST be
--   cast to regdictionary explicitly. Single-arg form picks "default" dict at runtime
--   which can drift if a different dict gets installed later.
--
-- Why expression index: matches `lower(public.immutable_unaccent($1))` exactly so
--   PostgREST RPC + raw-input strategy yields O(log n) lookup, accent- and
--   case-insensitive.
--
-- Migration role: applied as `postgres` superuser via Supabase Mgmt API.
-- `postgres` BYPASSES RLS — fine, no INSERT here.
--
-- Post-apply verification:
--   1. `SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON e.extnamespace=n.oid
--       WHERE e.extname='unaccent';`
--      Supabase typically installs into the `extensions` schema, NOT `public`.
--      If `extensions`, this migration's `public.unaccent` references will fail —
--      retry below with `extensions.unaccent` substitution.
--   2. `EXPLAIN SELECT * FROM attorneys
--       WHERE jurisdiction='CA'
--         AND lower(immutable_unaccent(full_name)) = 'jose garcia';`
--      Should show `Index Scan using idx_attorneys_full_name_norm`.
--   3. `SELECT * FROM attorney_match_by_raw_name('CA','Jose Garcia');`
--      Should return zero or more rows; should NOT error.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- IMMUTABLE wrapper — pinned to the 'unaccent' dictionary (default).
-- The CAST to regdictionary forces overload resolution to the two-arg form.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1)
$$;

COMMENT ON FUNCTION public.immutable_unaccent(text) IS
  'IMMUTABLE wrapper over unaccent() pinned to the public.unaccent dictionary.
   Required for expression-index use (unaccent itself is STABLE).
   See worry-attorney-discipline-wire plan T1.1a, 2026-04-25.';

-- Expression index over normalized name. WHERE clause keeps it lean — NULL
-- full_name rows aren't matchable anyway (per Sec v4 WARN).
CREATE INDEX IF NOT EXISTS idx_attorneys_full_name_norm
  ON public.attorneys (jurisdiction, lower(public.immutable_unaccent(full_name)))
  WHERE full_name IS NOT NULL;

-- Stored RPC — service-role only. Anon-key callers get HTTP 404 + body
-- `{ code: 'PGRST202' }` because they have no EXECUTE grant (verified
-- in tests: supabase/functions/__tests__/rls-attorney-discipline.test.ts).
CREATE OR REPLACE FUNCTION public.attorney_match_by_raw_name(
  jur       text,
  raw_name  text
)
  RETURNS SETOF public.attorneys
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
AS $$
  SELECT *
  FROM public.attorneys
  WHERE jurisdiction = jur
    AND lower(public.immutable_unaccent(full_name))
      = lower(public.immutable_unaccent(raw_name));
$$;

COMMENT ON FUNCTION public.attorney_match_by_raw_name(text, text) IS
  'Exact-match attorney lookup with accent + case folding. Service-role only.
   Anon callers see PostgREST 404 PGRST202. See worry-attorney-discipline-wire
   T1.2, 2026-04-25.';

-- Lock down execute privileges. service_role bypasses GRANT/REVOKE because it
-- bypasses RLS, but PostgREST's anon/authenticated roles require an explicit
-- EXECUTE grant to call the RPC. Without it, PostgREST returns 404 PGRST202.
REVOKE ALL ON FUNCTION public.attorney_match_by_raw_name(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attorney_match_by_raw_name(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.attorney_match_by_raw_name(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attorney_match_by_raw_name(text, text) TO service_role;
