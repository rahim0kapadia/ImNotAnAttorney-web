-- 022-customer-portal.sql
-- Customer magic link + session tables (mirrors partner auth pattern from 014/020).
-- Enables customers with paid orders to log in and view their cases.

-- ── Customer magic link tokens ──────────────────────────────
CREATE TABLE IF NOT EXISTS customer_magic_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ── Customer sessions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  session_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── RLS (service_role bypasses, block anon/public) ──────────
ALTER TABLE customer_magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX idx_customer_magic_links_token ON customer_magic_links(token);
CREATE INDEX idx_customer_sessions_hash ON customer_sessions(session_token_hash);

-- ── Atomic consume function ─────────────────────────────────
-- Mirrors consume_magic_link() for partners (020-security-and-integrity.sql).
-- Accepts the raw token, hashes it, and atomically marks as used.
-- Returns the email if valid, NULL otherwise.
CREATE OR REPLACE FUNCTION consume_customer_magic_link(p_token text)
RETURNS text AS $$
DECLARE
  v_email text;
BEGIN
  UPDATE customer_magic_links
  SET used_at = now()
  WHERE token = encode(sha256(p_token::bytea), 'hex')
    AND used_at IS NULL
    AND expires_at > now()
  RETURNING email INTO v_email;

  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Restrict to service_role only (matches partner pattern)
REVOKE EXECUTE ON FUNCTION consume_customer_magic_link(text) FROM public;
REVOKE EXECUTE ON FUNCTION consume_customer_magic_link(text) FROM anon;
GRANT EXECUTE ON FUNCTION consume_customer_magic_link(text) TO service_role;
