-- 20260504a_cross_corpus_indexes.sql
-- Indexes enabling cross-corpus matview joins.
-- Cited expert: Lukas Fittl (idx-on-foreign-key + partial-index patterns).

-- (1) cl_dockets.assigned_to_id: matview join target for judge_id lookup.
-- 71M rows; CONCURRENTLY avoids SHARE lock on write-active table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cl_dockets_assigned_to_id
  ON public.cl_dockets (assigned_to_id)
  WHERE assigned_to_id IS NOT NULL;

-- (2) judge_profiles.cl_person_id::bigint cast: hot path for cl_dockets.assigned_to_id JOIN.
-- Functional index on the cast value avoids per-row casting at query time.
CREATE INDEX IF NOT EXISTS idx_judge_profiles_cl_person_id_bigint
  ON public.judge_profiles ((cl_person_id::bigint))
  WHERE cl_person_id IS NOT NULL AND cl_person_id ~ '^[0-9]+$';

-- (3) entities_officers normalized lookup: name_last + jurisdiction for officer-name resolution.
-- NOTE: schema-lock confirmed entities_officers uses `jurisdiction` column (not `state`).
CREATE INDEX IF NOT EXISTS idx_entities_officers_name_jurisdiction
  ON public.entities_officers (lower(name_last), lower(jurisdiction))
  WHERE name_last IS NOT NULL AND jurisdiction IS NOT NULL;

-- (4) judge_motion_outcome_rates already has idx_judge_motion_outcome_rates_pkey (author_id, motion_type).
-- No new index needed.

-- (5) benchrecon_ussc_extension: per-judge per-offense-type lookup for bench fingerprint.
-- CONCURRENTLY: table has 80K+ rows, avoid locking during build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_benchrecon_ussc_dist_offtype
  ON public.benchrecon_ussc_extension (suppdist, offtype2);

-- (6) cl_dockets.nature_of_suit: criminal-vs-civil filter.
-- CONCURRENTLY: same 71M-row table as (1).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cl_dockets_nature_of_suit
  ON public.cl_dockets (nature_of_suit)
  WHERE nature_of_suit IS NOT NULL;
