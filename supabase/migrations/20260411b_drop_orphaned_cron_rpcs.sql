-- Drop orphaned cron lock RPCs
-- These were superseded by the JS implementation in src/lib/cron-idempotency.ts
-- Verified: zero references to either function in src/ or engine/src/

DROP FUNCTION IF EXISTS acquire_cron_lock(text, integer);
DROP FUNCTION IF EXISTS release_cron_lock(text);
