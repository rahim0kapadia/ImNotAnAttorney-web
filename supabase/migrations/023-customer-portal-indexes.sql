-- Add expiry indexes to customer auth tables (matches partner table pattern)
CREATE INDEX IF NOT EXISTS idx_customer_magic_links_expires ON customer_magic_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expires ON customer_sessions(expires_at);

-- Remove redundant index from feature_flags (UNIQUE constraint already creates one)
DROP INDEX IF EXISTS idx_feature_flags_key;
