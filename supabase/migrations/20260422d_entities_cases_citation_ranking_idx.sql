-- Round-2 finding W7: create the actual index for the whitelist hot path
-- promised by round-1 F2. The tracked artifact at
-- docs/db-ops/2026-04-22-entities-cases-citation-ranking-idx.md is not a close —
-- this migration is.
--
-- Index covers the query in src/lib/report/entity-whitelist.ts:
--   SELECT ... FROM entities_cases
--   WHERE citation_count > 0
--   ORDER BY citation_count DESC, date_filed DESC NULLS LAST
--   LIMIT 200
-- Partial WHERE excludes citation_count NULL/zero rows (the long tail on 7.78M
-- rows); secondary sort on date_filed for stable order with NULLS LAST.
--
-- Round-2 finding F9: NULLS LAST dropped from citation_count — the partial
-- WHERE citation_count > 0 excludes nulls structurally, so adding NULLS LAST
-- on the leading sort key is redundant pg noise.
--
-- Defensive session settings per ~/.claude/rules/cl-bulk-data-defensive.md
-- (gotcha #17 — zombie-backend defense).

SET statement_timeout = '30min';
SET tcp_keepalives_idle = 60;
SET tcp_keepalives_interval = 10;
SET tcp_keepalives_count = 6;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entities_cases_citation_ranking
  ON entities_cases (citation_count DESC, date_filed DESC NULLS LAST)
  WHERE citation_count > 0;

COMMENT ON INDEX idx_entities_cases_citation_ranking IS
  'Phase 2 (round-2 W7): powers the whitelist hot path in src/lib/report/entity-whitelist.ts — ordered by citation_count DESC then date_filed DESC NULLS LAST, partial WHERE citation_count > 0 (long-tail exclusion).';
