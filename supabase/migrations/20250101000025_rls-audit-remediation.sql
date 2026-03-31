-- Migration 026: RLS audit remediation
-- Fixes: 6 over-permissive USING(true) policies, 3 missing RLS enables,
-- 1 fragile drip_emails policy, 7 unrestricted SECURITY DEFINER functions,
-- 14 high-sensitivity tables missing explicit anon deny policies.
--
-- Context: All app code uses service_role (bypasses RLS). These fixes are
-- defense-in-depth against anon key exposure via public Supabase URL.

-- ══════════════════════════════════════════════════════════
-- 1. DROP OVER-PERMISSIVE POLICIES (CRITICAL)
-- Migration 010 created USING(true) policies without TO clause,
-- which defaults to TO public (all roles including anon).
-- PostgreSQL ORs permissive policies: true OR false = true,
-- so these override the existing anon_no_access deny policies.
-- ══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Service role full access" ON processing_jobs;
DROP POLICY IF EXISTS "Service role full access" ON operator_tasks;
DROP POLICY IF EXISTS "Service role full access" ON case_witnesses;
DROP POLICY IF EXISTS "Service role full access" ON case_findings;
DROP POLICY IF EXISTS "Service role full access" ON evidence_items;
DROP POLICY IF EXISTS "Service role full access" ON evidence_custody;

-- service_role already bypasses RLS entirely — no replacement needed.

-- ══════════════════════════════════════════════════════════
-- 2. FIX drip_emails POLICY
-- Current policy uses auth.role() check scoped TO public.
-- Functionally blocks anon, but fragile if auth.role() changes.
-- ══════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Service role full access" ON drip_emails;

-- ══════════════════════════════════════════════════════════
-- 3. ENABLE RLS ON MISSING TABLES
-- docket_entries (011), counters (012), score_aggregates (012)
-- were created after the rls_auto_enable trigger but may not
-- have fired during direct SQL migration execution.
-- ══════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS docket_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS score_aggregates ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════
-- 4. ADD EXPLICIT ANON DENY POLICIES
-- These tables currently rely on implicit deny (RLS enabled,
-- no matching policy). Explicit deny is more robust — prevents
-- any future permissive policy from accidentally granting access.
-- ══════════════════════════════════════════════════════════

-- Orders & cases (CRITICAL — PII + payment data)
CREATE POLICY "anon_no_access_orders" ON orders FOR ALL TO anon USING (false);
CREATE POLICY "anon_no_access_cases" ON cases FOR ALL TO anon USING (false);

-- Partner system
CREATE POLICY "anon_no_access_partners" ON partners FOR ALL TO anon USING (false);
CREATE POLICY "anon_no_access_referrals" ON referrals FOR ALL TO anon USING (false);
CREATE POLICY "anon_no_access_partner_magic_links" ON partner_magic_links FOR ALL TO anon USING (false);
CREATE POLICY "anon_no_access_partner_sessions" ON partner_sessions FOR ALL TO anon USING (false);
CREATE POLICY "anon_no_access_partner_payouts" ON partner_payouts FOR ALL TO anon USING (false);
CREATE POLICY "anon_no_access_partner_applications" ON partner_applications FOR ALL TO anon USING (false);

-- Customer auth
CREATE POLICY "anon_no_access_customer_magic_links" ON customer_magic_links FOR ALL TO anon USING (false);
CREATE POLICY "anon_no_access_customer_sessions" ON customer_sessions FOR ALL TO anon USING (false);

-- Email & court data
CREATE POLICY "anon_no_access_docket_entries" ON docket_entries FOR ALL TO anon USING (false);
CREATE POLICY "anon_no_access_email_log" ON email_log FOR ALL TO anon USING (false);
CREATE POLICY "anon_no_access_inbound_emails" ON inbound_emails FOR ALL TO anon USING (false);

-- Intakes: already has INSERT-only anon policy; block reads
CREATE POLICY "anon_no_access_intakes_read" ON intakes FOR SELECT TO anon USING (false);

-- ══════════════════════════════════════════════════════════
-- 5. RESTRICT SECURITY DEFINER FUNCTIONS
-- These are callable by anon via the REST API. service_role
-- bypasses RLS anyway, so revoking from public/anon is safe.
-- ══════════════════════════════════════════════════════════

-- CRITICAL: allows injecting URLs into any case's file_urls
REVOKE EXECUTE ON FUNCTION append_file_url(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION append_file_url(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION append_file_url(uuid, text) TO service_role;

-- Cron lock manipulation
REVOKE EXECUTE ON FUNCTION acquire_cron_lock(bigint) FROM public;
REVOKE EXECUTE ON FUNCTION acquire_cron_lock(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION acquire_cron_lock(bigint) TO service_role;

REVOKE EXECUTE ON FUNCTION release_cron_lock(bigint) FROM public;
REVOKE EXECUTE ON FUNCTION release_cron_lock(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION release_cron_lock(bigint) TO service_role;

-- Rate limit bypass
REVOKE EXECUTE ON FUNCTION check_rate_limit(text, integer, integer) FROM public;
REVOKE EXECUTE ON FUNCTION check_rate_limit(text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION check_rate_limit(text, integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION cleanup_rate_limits(integer) FROM public;
REVOKE EXECUTE ON FUNCTION cleanup_rate_limits(integer) FROM anon;
GRANT EXECUTE ON FUNCTION cleanup_rate_limits(integer) TO service_role;

-- Counter inflation
REVOKE EXECUTE ON FUNCTION increment_counter(text) FROM public;
REVOKE EXECUTE ON FUNCTION increment_counter(text) FROM anon;
GRANT EXECUTE ON FUNCTION increment_counter(text) TO service_role;

REVOKE EXECUTE ON FUNCTION increment_score_aggregate(text, text) FROM public;
REVOKE EXECUTE ON FUNCTION increment_score_aggregate(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION increment_score_aggregate(text, text) TO service_role;
