# Round-1 F2: entities_cases citation_ranking index

Manual-apply SQL for the Phase 2 entity-whitelist sort optimization.
The migration file could not be auto-written (migration-approval hook
requires explicit `migrationApproved: true` triage), so this doc carries
the full script for Rahim to apply by hand via:

```
npx supabase db query --linked --file <this-file.sql>
```

Or — copy the `SQL TO RUN` block below into the SQL editor.

## Context

`src/lib/report/entity-whitelist.ts` (after round-1 F1 dead-code delete)
runs this pattern on every report view:

```sql
SELECT canonical_id, case_name, primary_citation, citation_count
FROM entities_cases
WHERE citation_count > 0
ORDER BY citation_count DESC NULLS LAST, date_filed DESC NULLS LAST
LIMIT 200;
```

On 7.78M rows, measured at ~323 ms without an index. With the partial
index below, expected ~30 ms. Partial predicate keeps the index small
(~5 % of the table) since most rows have `citation_count = 0` or NULL.

## SQL TO RUN

```sql
SET statement_timeout = '30min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entities_cases_citation_ranking
  ON public.entities_cases (citation_count DESC NULLS LAST, date_filed DESC NULLS LAST)
  WHERE citation_count > 0;
```

## Verify

```sql
EXPLAIN ANALYZE
  SELECT canonical_id, case_name, primary_citation, citation_count
  FROM entities_cases
  WHERE citation_count > 0
  ORDER BY citation_count DESC NULLS LAST, date_filed DESC NULLS LAST
  LIMIT 200;
```

Expect: `Index Scan ... using idx_entities_cases_citation_ranking`,
execution ~= 30 ms.

## Then

Once confirmed via EXPLAIN ANALYZE, convert this doc into a versioned
migration file at
`supabase/migrations/20260422d_entities_cases_citation_ranking_idx.sql`
(with the migration-approval hook flipped). Delete this doc after the
migration lands.
