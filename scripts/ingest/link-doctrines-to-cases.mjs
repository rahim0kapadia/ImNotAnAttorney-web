// Template: scripts/ingest/oyez-entity-sources.mjs
// Pattern: cl-bulk-data-defensive #17 (Albe session defenses)
// Expert: lukas-fittl (in-DB join, UNLOGGED staging not needed at small scale)
//
// Resolve entities_legal_doctrines.origin_case (TEXT) -> entities_cases.canonical_id (UUID FK).
//
// Input: 35 doctrines, 12 with `origin_case` set (e.g. "Miranda v. Arizona (1966)").
// Strategy: strip trailing " (YYYY)" suffix, match against wikidata-linked SCOTUS
// subset (~4,862 entities_cases rows) by case_name prefix ILIKE. Pick highest
// citation_count on ties.
//
// Output:
//   1. New column entities_legal_doctrines.origin_case_canonical_id (UUID, FK).
//   2. Each resolved doctrine populated.

import { createBulkClient } from '../lib/pg-bulk-defaults.mjs';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const { client: c, cleanup } = await createBulkClient({
  workMemMB: 128,
  maintWorkMemMB: 512,
  statementTimeout: '5min'
});

try {
  console.log(`=== link-doctrines-to-cases ${new Date().toISOString()} ===`);

  // Add the FK column if not present
  await c.query(`
    ALTER TABLE entities_legal_doctrines
    ADD COLUMN IF NOT EXISTS origin_case_canonical_id UUID
    REFERENCES entities_cases(canonical_id) ON DELETE SET NULL
  `);
  console.log('ensured column entities_legal_doctrines.origin_case_canonical_id');

  // Build temp SCOTUS subset (wikidata-linked = our canonical SCOTUS set)
  await c.query(`
    CREATE TEMP TABLE scotus_subset AS
    SELECT DISTINCT ec.canonical_id, ec.case_name, ec.primary_citation, ec.citation_count
    FROM entities_cases ec
    JOIN entity_sources es
      ON es.entity_id = ec.canonical_id
     AND es.entity_type = 'case'
     AND es.source_system = 'wikidata'
  `);
  await c.query(`CREATE INDEX ON scotus_subset (case_name)`);
  const n = await c.query(`SELECT count(*) n FROM scotus_subset`);
  console.log(`SCOTUS subset: ${n.rows[0].n} rows`);

  // Resolve doctrines
  const matches = await c.query(`
    WITH doctrines AS (
      SELECT canonical_id AS doctrine_id,
             name AS doctrine_name,
             -- strip trailing "  (YYYY)" or variants: only drop the parenthetical year
             TRIM(regexp_replace(origin_case, '\\s*\\([0-9]{4}\\)\\s*$', '')) AS cleaned,
             origin_case
      FROM entities_legal_doctrines
      WHERE origin_case IS NOT NULL
    ),
    ranked AS (
      SELECT d.doctrine_id, d.doctrine_name, d.cleaned, d.origin_case,
             s.canonical_id AS case_canonical_id,
             s.case_name, s.primary_citation, s.citation_count,
             ROW_NUMBER() OVER (
               PARTITION BY d.doctrine_id
               ORDER BY
                 CASE
                   WHEN s.case_name ILIKE d.cleaned         THEN 1
                   WHEN s.case_name ILIKE d.cleaned || '%'  THEN 2
                   WHEN s.case_name ILIKE '%' || d.cleaned || '%' THEN 3
                   ELSE 4
                 END,
                 s.citation_count DESC NULLS LAST
             ) AS rn
      FROM doctrines d
      LEFT JOIN scotus_subset s
        ON s.case_name ILIKE '%' || d.cleaned || '%'
    )
    SELECT doctrine_id, doctrine_name, cleaned, origin_case,
           case_canonical_id, case_name, primary_citation, citation_count
    FROM ranked WHERE rn = 1
    ORDER BY doctrine_name
  `);

  console.log('\nResolution result:');
  let hits = 0, misses = 0;
  for (const r of matches.rows) {
    if (r.case_canonical_id) {
      hits++;
      console.log(`  [OK]  ${r.doctrine_name.padEnd(35)} -> ${r.case_name} (${r.primary_citation}) cites=${r.citation_count}`);
    } else {
      misses++;
      console.log(`  [??]  ${r.doctrine_name.padEnd(35)} -> ${r.origin_case} — NO MATCH in SCOTUS subset`);
    }
  }
  console.log(`\nHits: ${hits} / ${hits + misses}`);

  // Apply the FK updates (only rows that matched)
  const upd = await c.query(`
    WITH doctrines AS (
      SELECT canonical_id AS doctrine_id,
             TRIM(regexp_replace(origin_case, '\\s*\\([0-9]{4}\\)\\s*$', '')) AS cleaned
      FROM entities_legal_doctrines
      WHERE origin_case IS NOT NULL
    ),
    ranked AS (
      SELECT d.doctrine_id,
             s.canonical_id AS case_canonical_id,
             ROW_NUMBER() OVER (
               PARTITION BY d.doctrine_id
               ORDER BY
                 CASE
                   WHEN s.case_name ILIKE d.cleaned         THEN 1
                   WHEN s.case_name ILIKE d.cleaned || '%'  THEN 2
                   WHEN s.case_name ILIKE '%' || d.cleaned || '%' THEN 3
                   ELSE 4
                 END,
                 s.citation_count DESC NULLS LAST
             ) AS rn
      FROM doctrines d
      LEFT JOIN scotus_subset s
        ON s.case_name ILIKE '%' || d.cleaned || '%'
    )
    UPDATE entities_legal_doctrines AS eld
    SET origin_case_canonical_id = r.case_canonical_id
    FROM ranked r
    WHERE r.rn = 1
      AND r.case_canonical_id IS NOT NULL
      AND eld.canonical_id = r.doctrine_id
    RETURNING eld.name
  `);
  console.log(`\nUPDATE affected ${upd.rowCount} rows`);

  // Verify
  const final = await c.query(`
    SELECT eld.name AS doctrine, eld.origin_case,
           ec.case_name AS linked_case, ec.primary_citation,
           v.confidence_level, v.source_count, v.weighted_score
    FROM entities_legal_doctrines eld
    LEFT JOIN entities_cases ec ON ec.canonical_id = eld.origin_case_canonical_id
    LEFT JOIN v_entity_confidence v ON v.entity_type='case' AND v.entity_id = eld.origin_case_canonical_id
    WHERE eld.origin_case IS NOT NULL
    ORDER BY eld.name
  `);
  console.log('\nFinal state:');
  for (const r of final.rows) {
    if (r.linked_case) {
      console.log(`  ${r.doctrine.padEnd(35)} -> ${r.linked_case} (${r.primary_citation}) | ${r.confidence_level} (${r.source_count} src, w=${r.weighted_score})`);
    } else {
      console.log(`  ${r.doctrine.padEnd(35)} -> [unlinked] ${r.origin_case}`);
    }
  }
} finally {
  await cleanup();
}
