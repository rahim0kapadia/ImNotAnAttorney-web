-- Phase 1a: Clean officer_reliability garbage names
-- Removes: role titles, sentence fragments, verb-containing parses, short/long names, numeric strings
-- Then deduplicates: keeps highest testimony_count per officer_name
-- Before: 11,818 rows. Expected after: ~2,825 unique officers.

BEGIN;

-- Step 1: Delete garbage rows
DELETE FROM officer_reliability
WHERE NOT (
  length(officer_name) BETWEEN 3 AND 40
  AND officer_name !~* '^(attorney|public defender|prosecut|clerk|defender$|district attorney|state attorney|solicitor|counsel|judge|justice|magistrate|the |a |an )'
  AND officer_name !~* '(testified|attempted|pursued|stated|claimed|alleged|reported|requested|denied|granted|filed|entered|ordered|arrested|charged|searched|seized|stopped|detained|convicted|sentenced|appealed|indicted|called the|pulled in|came down|also |was the|were the|that |have |had been|his |her |the |this |when |after |before )'
  AND officer_name !~* '[0-9]{3,}'
);

-- Step 2: Deduplicate — keep the row with highest testimony_count per officer_name
DELETE FROM officer_reliability
WHERE id NOT IN (
  SELECT DISTINCT ON (officer_name) id
  FROM officer_reliability
  ORDER BY officer_name, testimony_count DESC NULLS LAST
);

COMMIT;
