-- Add state_code column to bench_jury_divergence for state-level data filtering.
-- Virginia court data uses locality names (e.g., "Fairfax County") that don't contain
-- the state name, so the engine's ILIKE '%Virginia%' query misses them.
-- state_code enables direct filtering: WHERE state_code = 'VA'.

ALTER TABLE bench_jury_divergence ADD COLUMN IF NOT EXISTS state_code text;

-- Index for state_code lookups (engine queries by state)
CREATE INDEX IF NOT EXISTS bench_jury_div_state_code_idx
  ON bench_jury_divergence (state_code)
  WHERE state_code IS NOT NULL;

-- Backfill USSC rows: extract state from federal district names.
-- Pattern: "District of X", "Eastern/Western/Northern/Southern/Middle/Central District of X"
-- STATE_NAMES map in engine uses 2-letter codes, so we map district → state_code.
-- Only updates rows where state_code IS NULL (idempotent).

-- Single-state districts
UPDATE bench_jury_divergence SET state_code = 'ME' WHERE district ILIKE '%Maine%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'NH' WHERE district ILIKE '%New Hampshire%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'MA' WHERE district ILIKE '%Massachusetts%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'RI' WHERE district ILIKE '%Rhode Island%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'CT' WHERE district ILIKE '%Connecticut%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'NY' WHERE district ILIKE '%New York%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'NJ' WHERE district ILIKE '%New Jersey%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'PA' WHERE district ILIKE '%Pennsylvania%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'DE' WHERE district ILIKE '%Delaware%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'MD' WHERE district ILIKE '%Maryland%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'VA' WHERE district ILIKE '%Virginia%' AND district NOT ILIKE '%West Virginia%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'WV' WHERE district ILIKE '%West Virginia%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'NC' WHERE district ILIKE '%North Carolina%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'SC' WHERE district ILIKE '%South Carolina%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'GA' WHERE district ILIKE '%Georgia%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'FL' WHERE district ILIKE '%Florida%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'AL' WHERE district ILIKE '%Alabama%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'MS' WHERE district ILIKE '%Mississippi%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'LA' WHERE district ILIKE '%Louisiana%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'TX' WHERE district ILIKE '%Texas%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'OK' WHERE district ILIKE '%Oklahoma%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'KS' WHERE district ILIKE '%Kansas%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'MO' WHERE district ILIKE '%Missouri%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'AR' WHERE district ILIKE '%Arkansas%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'NE' WHERE district ILIKE '%Nebraska%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'ND' WHERE district ILIKE '%North Dakota%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'SD' WHERE district ILIKE '%South Dakota%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'MN' WHERE district ILIKE '%Minnesota%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'IA' WHERE district ILIKE '%Iowa%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'IL' WHERE district ILIKE '%Illinois%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'WI' WHERE district ILIKE '%Wisconsin%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'IN' WHERE district ILIKE '%Indiana%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'OH' WHERE district ILIKE '%Ohio%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'MI' WHERE district ILIKE '%Michigan%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'KY' WHERE district ILIKE '%Kentucky%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'TN' WHERE district ILIKE '%Tennessee%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'CO' WHERE district ILIKE '%Colorado%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'WY' WHERE district ILIKE '%Wyoming%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'UT' WHERE district ILIKE '%Utah%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'NM' WHERE district ILIKE '%New Mexico%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'AZ' WHERE district ILIKE '%Arizona%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'NV' WHERE district ILIKE '%Nevada%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'CA' WHERE district ILIKE '%California%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'OR' WHERE district ILIKE '%Oregon%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'WA' WHERE district ILIKE '%Washington%' AND district NOT ILIKE '%District of Columbia%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'ID' WHERE district ILIKE '%Idaho%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'MT' WHERE district ILIKE '%Montana%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'AK' WHERE district ILIKE '%Alaska%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'HI' WHERE district ILIKE '%Hawaii%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'GU' WHERE district ILIKE '%Guam%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'PR' WHERE district ILIKE '%Puerto Rico%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'VI' WHERE district ILIKE '%Virgin Islands%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'DC' WHERE district ILIKE '%District of Columbia%' AND state_code IS NULL;
UPDATE bench_jury_divergence SET state_code = 'MP' WHERE district ILIKE '%Northern Mariana%' AND state_code IS NULL;
