// Template: scripts/ingest/wikidata-statutes-doctrines-forensics.mjs
// Pattern: cl-bulk-data-defensive #17 (Albe session defenses)
//
// Fix three 2026-04-21 Wikidata-ingest anomalies:
//
// 1. shoeprint-tiretrack pcast_slug wrongly linked to Q643819 "Footprint (electronics)".
//    Drop the bogus wikidata_qid + its 2 entity_sources rows. No good Wikidata QID
//    exists for forensic shoeprint/tiretrack — leave qid NULL until manual research.
//
// 2. Re-add double-jeopardy doctrine. Prior ingest matched wrong label ("Triple oppression")
//    via altLabel OR. Manually insert with verified QID Q170518.
//
// 3. Investigate: one doctrine ("mistrial") stuck at medium. Wikipedia redirects
//    mistrial -> trial so no dedicated article. Skip — acceptable gap.

import { createBulkClient } from '../lib/pg-bulk-defaults.mjs';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const { client: c, cleanup } = await createBulkClient({
  workMemMB: 64,
  statementTimeout: '2min'
});

try {
  console.log(`=== fix-wikidata-mismatches ${new Date().toISOString()} ===`);

  // ----- Fix 1: shoeprint bogus wikidata_qid
  const shoe = await c.query(`
    SELECT canonical_id, wikidata_qid
    FROM entities_forensic_disciplines
    WHERE pcast_slug = 'shoeprint-tiretrack'
  `);
  if (shoe.rows.length > 0) {
    const id = shoe.rows[0].canonical_id;
    console.log(`shoeprint-tiretrack canonical_id: ${id} — dropping bogus QID ${shoe.rows[0].wikidata_qid}`);
    const del = await c.query(
      `DELETE FROM entity_sources WHERE entity_type='forensic' AND entity_id=$1 AND source_system IN ('wikidata','wikipedia')`,
      [id]
    );
    console.log(`  deleted ${del.rowCount} entity_sources rows`);
    await c.query(
      `UPDATE entities_forensic_disciplines SET wikidata_qid = NULL WHERE canonical_id=$1`,
      [id]
    );
    console.log('  wikidata_qid nulled on entities_forensic_disciplines');
  } else {
    console.log('shoeprint-tiretrack not found (already cleaned)');
  }

  // ----- Fix 2: re-add double jeopardy with verified QID
  const dj = await c.query(`SELECT canonical_id FROM entities_legal_doctrines WHERE name = 'double jeopardy'`);
  if (dj.rows.length === 0) {
    const ins = await c.query(`
      INSERT INTO entities_legal_doctrines (name, category, origin_case, wikidata_qid)
      VALUES ('double jeopardy', '5a', NULL, 'Q170518')
      RETURNING canonical_id
    `);
    const doctId = ins.rows[0].canonical_id;
    console.log(`inserted double jeopardy doctrine canonical_id=${doctId}`);

    // Add entity_sources for wikidata + wikipedia
    await c.query(
      `INSERT INTO entity_sources (entity_type, entity_id, source_system, source_ref, source_url, retrieved_at, raw_table, raw_row_id)
       VALUES
         ('doctrine', $1::uuid, 'wikidata', 'Q170518', 'https://www.wikidata.org/wiki/Q170518', NOW(), 'entities_legal_doctrines', $2::text),
         ('doctrine', $1::uuid, 'wikipedia', 'double jeopardy', 'https://en.wikipedia.org/wiki/Double_jeopardy', NOW(), 'entities_legal_doctrines', $2::text)
       ON CONFLICT (entity_type, entity_id, source_system, source_ref) DO NOTHING`,
      [doctId, String(doctId)]
    );
    console.log('  added wikidata + wikipedia entity_sources');
  } else {
    console.log('double jeopardy already present');
  }

  // ----- Verify
  const summary = await c.query(`
    SELECT entity_type, confidence_level, count(*) n
    FROM v_entity_confidence
    WHERE entity_type IN ('doctrine','forensic')
    GROUP BY 1, 2
    ORDER BY 1, 2
  `);
  console.log('\nPost-fix distribution:');
  for (const r of summary.rows) console.log(`  ${r.entity_type} | ${r.confidence_level}: ${r.n}`);

  const djfinal = await c.query(`
    SELECT eld.name, v.source_count, v.source_systems, v.weighted_score, v.confidence_level
    FROM entities_legal_doctrines eld
    LEFT JOIN v_entity_confidence v ON v.entity_type='doctrine' AND v.entity_id = eld.canonical_id
    WHERE eld.name = 'double jeopardy'
  `);
  console.log('\ndouble jeopardy confidence:', djfinal.rows[0]);

  const shoefinal = await c.query(`
    SELECT pcast_slug, wikidata_qid FROM entities_forensic_disciplines WHERE pcast_slug = 'shoeprint-tiretrack'
  `);
  console.log('shoeprint final:', shoefinal.rows[0]);
} finally {
  await cleanup();
}
