-- 2026-04-24: Defense-in-depth RESTRICTIVE policy on public.orders
--
-- Source: Round 1 wave-pristine adversarial audit, SUGGESTION #6.
-- Per ARCHITECTURE.md Invariant #4, all DB access flows through the
-- service-role admin client; RLS is defense-in-depth, not primary auth.
-- This migration adds an explicit RESTRICTIVE policy so that if a future
-- permissive policy is ever added for the `authenticated` role (e.g. a
-- mistake in a later migration), it cannot accidentally unlock the
-- sensitive columns on `orders`: token hashes, JSONB state blobs,
-- standalone intake payloads, refund state.
--
-- In Postgres RLS, a row passes iff EVERY restrictive policy returns true
-- AND at least one permissive policy returns true. Setting RESTRICTIVE
-- USING (false) guarantees authenticated-role access is always denied,
-- regardless of what permissive policies exist now or are added later.
--
-- Deliberately NOT applied to production in the PR that lands this file.
-- See docs/plans/2026-04-23-worry-wave-pristine.md for the deferred-apply
-- plan. Applying requires explicit run via `npx supabase db push` against
-- the linked prod project once the next service-role-only audit confirms
-- no `authenticated` code path is still in use for `orders`.

CREATE POLICY "authenticated_no_access_orders"
  ON public.orders
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (false);

COMMENT ON POLICY "authenticated_no_access_orders" ON public.orders IS
  'Defense-in-depth (wave-pristine-r1 SUGGESTION #6). Blocks any future '
  'permissive policy from accidentally unlocking token hashes + JSONB '
  'state columns for the authenticated role. Orders are service-role only.';
