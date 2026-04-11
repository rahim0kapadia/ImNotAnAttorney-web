-- Dedup Tier 9 tables — judge_quotes and sentencing_distributions were doubled
-- by a crashed session that re-applied INSERT SQL on top of existing data.
-- Uses ctid to identify physical duplicates (keeps one copy per unique combo).

-- judge_quotes: dedup on (judge_id, quote, cluster_id)
-- Two passes: first handles non-null judge_id equality, second is NULL-safe
-- (NULL = NULL is false in SQL, so a COALESCE pass is required for null partitions)
DELETE FROM judge_quotes a USING judge_quotes b
WHERE a.ctid > b.ctid
  AND a.judge_id = b.judge_id
  AND a.quote = b.quote
  AND COALESCE(a.cluster_id::text, '') = COALESCE(b.cluster_id::text, '');

-- NULL-safe second pass (catches rows where judge_id IS NULL on both sides)
DELETE FROM judge_quotes a USING judge_quotes b
WHERE a.ctid > b.ctid
  AND COALESCE(a.judge_id::text, '__null__') = COALESCE(b.judge_id::text, '__null__')
  AND a.quote = b.quote
  AND COALESCE(a.cluster_id::text, '') = COALESCE(b.cluster_id::text, '');

-- sentencing_distributions: dedup on (judge_id, jurisdiction, charge_slug)
DELETE FROM sentencing_distributions a USING sentencing_distributions b
WHERE a.ctid > b.ctid
  AND COALESCE(a.judge_id::text, '') = COALESCE(b.judge_id::text, '')
  AND COALESCE(a.jurisdiction, '') = COALESCE(b.jurisdiction, '')
  AND a.charge_slug = b.charge_slug;
