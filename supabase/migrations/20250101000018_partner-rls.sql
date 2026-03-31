-- 018-partner-rls.sql
-- Enable RLS on partner portal tables for defense-in-depth.
-- All access goes through service_role (bypasses RLS), so no permissive
-- policies are needed. This prevents anon-key clients from accessing
-- sensitive partner data if the key is ever exposed.

ALTER TABLE partner_magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
