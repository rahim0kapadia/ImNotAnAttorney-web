-- 20260419c: REVOKE partner_peer_benchmark from authenticated role.
--
-- 20260419b granted EXECUTE to both authenticated and service_role. The
-- reviewer fan-out correctness pass flagged this as an IDOR surface: any
-- Supabase JWT bearer (including defendant accounts holding authenticated
-- sessions from prior purchases) could call the RPC with arbitrary
-- p_partner_id and read any bondsman's 30-day reminder count and rank.
--
-- The /api/partner/dashboard route uses createAdminClient() which runs as
-- service_role, so the authenticated grant was never needed for the
-- documented use case. Revoking closes the enumeration surface.

BEGIN;

-- Supabase auto-grants EXECUTE to anon + authenticated on any public
-- function. REVOKE FROM public does NOT touch these roles — they must be
-- named explicitly. Both revoked here.
REVOKE EXECUTE ON FUNCTION public.partner_peer_benchmark(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.partner_peer_benchmark(uuid) FROM authenticated;

COMMIT;
