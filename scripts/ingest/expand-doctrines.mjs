// Template: scripts/ingest/fix-wikidata-mismatches.mjs
// Pattern: Wikipedia REST API reverse lookup for Wikidata QID
//
// Add 7 more canonical doctrines missed by the original Wikidata SPARQL pass.
// Each resolves via Wikipedia REST summary (includes wikibase_item = QID).
//
// Target doctrines:
//   - Batson challenge (Batson v. Kentucky, 476 U.S. 79)
//   - necessity defense (criminal)
//   - duress (criminal defense)
//   - Allen charge (dynamite charge)
//   - good-faith exception (to exclusionary rule)
//   - stop-and-frisk
//   - rule of lenity

import { createBulkClient } from '../lib/pg-bulk-defaults.mjs';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const USER_AGENT = 'ImNotAnAttorney/1.0 (https://imnotanattorney.com; legal-research)';

// { doctrine name, category, wikipedia title, origin_case citation if any }
const DOCTRINES = [
  { name: 'Batson challenge',     category: '6a',         wpTitle: 'Batson_v._Kentucky',            origin_case: 'Batson v. Kentucky (1986)',       originCitation: '476 U.S. 79' },
  { name: 'necessity (criminal)', category: 'defense',    wpTitle: 'Necessity_(criminal_law)',      origin_case: null,                               originCitation: null },
  { name: 'duress (criminal)',    category: 'defense',    wpTitle: 'Duress',                        origin_case: null,                               originCitation: null },
  { name: 'Allen charge',         category: 'trial',      wpTitle: 'Allen_v._United_States_(1896)', origin_case: 'Allen v. United States (1896)',   originCitation: '164 U.S. 492' },
  { name: 'good-faith exception', category: '4a',         wpTitle: 'Good-faith_exception',          origin_case: 'United States v. Leon (1984)',    originCitation: '468 U.S. 897' },
  { name: 'stop-and-frisk',       category: '4a',         wpTitle: 'Stop-and-frisk_in_the_United_States', origin_case: null,                         originCitation: null },
  { name: 'rule of lenity',       category: 'procedural', wpTitle: 'Rule_of_lenity',                origin_case: null,                               originCitation: null },
];

async function wpSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia ${res.status} on ${title}`);
  return await res.json();
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const { client: c, cleanup } = await createBulkClient({
  workMemMB: 128,
  statementTimeout: '3min'
});

try {
  console.log(`=== expand-doctrines ${new Date().toISOString()} ===`);

  for (const d of DOCTRINES) {
    // Skip if already present
    const exist = await c.query(`SELECT canonical_id FROM entities_legal_doctrines WHERE name = $1`, [d.name]);
    if (exist.rows.length > 0) {
      console.log(`[skip] ${d.name} already present`);
      continue;
    }

    try {
      const wp = await wpSummary(d.wpTitle);
      const qid = wp.wikibase_item;
      const wikipediaUrl = wp.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${d.wpTitle}`;
      console.log(`[fetch] ${d.name.padEnd(25)} wp="${d.wpTitle}" qid=${qid}`);

      // Insert canonical doctrine
      const ins = await c.query(`
        INSERT INTO entities_legal_doctrines (name, category, origin_case, wikidata_qid)
        VALUES ($1, $2, $3, $4)
        RETURNING canonical_id
      `, [d.name, d.category, d.origin_case, qid]);
      const id = ins.rows[0].canonical_id;

      // entity_sources: wikidata + wikipedia
      await c.query(`
        INSERT INTO entity_sources (entity_type, entity_id, source_system, source_ref, source_url, retrieved_at, raw_table, raw_row_id)
        VALUES
          ('doctrine', $1::uuid, 'wikidata',  $3, 'https://www.wikidata.org/wiki/' || $3, NOW(), 'entities_legal_doctrines', $2::text),
          ('doctrine', $1::uuid, 'wikipedia', $4, $5,                                    NOW(), 'entities_legal_doctrines', $2::text)
        ON CONFLICT (entity_type, entity_id, source_system, source_ref) DO NOTHING
      `, [id, String(id), qid, d.name, wikipediaUrl]);

      // walkerdb quote pass + entity_source
      const quoteIns = await c.query(`
        WITH ranked AS (
          SELECT case_id, section_index, turn_index, speaker, text,
                 ts_rank(to_tsvector('english', COALESCE(text,'')), plainto_tsquery('english', $1)) r
          FROM scotus_transcripts
          WHERE to_tsvector('english', COALESCE(text,'')) @@ plainto_tsquery('english', $1)
            AND length(text) BETWEEN 80 AND 1200
          ORDER BY r DESC LIMIT 20
        )
        INSERT INTO doctrine_quotes (doctrine_id, transcript_case_id, section_index, turn_index, speaker, quote_text, matched_term, ts_rank)
        SELECT $2::uuid, case_id, section_index, turn_index, speaker, text, $1, r FROM ranked
        ON CONFLICT (doctrine_id, transcript_case_id, section_index, turn_index, matched_term) DO NOTHING
        RETURNING 1
      `, [d.name, id]);
      if (quoteIns.rowCount > 0) {
        await c.query(`
          INSERT INTO entity_sources (entity_type, entity_id, source_system, source_ref, source_url, retrieved_at, raw_table, raw_row_id)
          VALUES ('doctrine', $1::uuid, 'walkerdb', 'doctrine:' || $3, 'https://github.com/walkerdb/supreme_court_transcripts', NOW(), 'scotus_transcripts', $2::text)
          ON CONFLICT (entity_type, entity_id, source_system, source_ref) DO NOTHING
        `, [id, String(id), d.name]);
      }
      console.log(`  -> inserted canonical_id=${id}, quotes=${quoteIns.rowCount}`);

      // Link origin case if citation provided + match in entities_cases
      if (d.originCitation) {
        const linked = await c.query(`
          UPDATE entities_legal_doctrines eld
          SET origin_case_canonical_id = ec.canonical_id
          FROM entities_cases ec
          WHERE eld.canonical_id = $1
            AND ec.primary_citation = $2
          RETURNING ec.case_name
        `, [id, d.originCitation]);
        if (linked.rows.length > 0) {
          console.log(`  linked origin: ${linked.rows[0].case_name} (${d.originCitation})`);
        } else {
          console.log(`  no origin case match for citation ${d.originCitation}`);
        }
      }
    } catch (err) {
      console.log(`  [ERR] ${d.name}: ${err.message}`);
    }
    await sleep(250);
  }

  // Final snapshot
  const summary = await c.query(`
    SELECT confidence_level, count(*) n
    FROM v_entity_confidence
    WHERE entity_type = 'doctrine'
    GROUP BY 1
    ORDER BY MIN(source_count)
  `);
  console.log('\ndoctrine confidence distribution:');
  for (const r of summary.rows) console.log(`  ${r.confidence_level}: ${r.n}`);

  const newOnes = await c.query(`
    SELECT eld.name, v.confidence_level, v.source_count, v.weighted_score, ec.case_name AS origin
    FROM entities_legal_doctrines eld
    LEFT JOIN v_entity_confidence v ON v.entity_type='doctrine' AND v.entity_id = eld.canonical_id
    LEFT JOIN entities_cases ec ON ec.canonical_id = eld.origin_case_canonical_id
    WHERE eld.name IN ('Batson challenge','necessity (criminal)','duress (criminal)','Allen charge','good-faith exception','stop-and-frisk','rule of lenity')
    ORDER BY eld.name
  `);
  console.log('\nnew doctrines:');
  for (const r of newOnes.rows) {
    console.log(`  ${r.name.padEnd(25)} | ${r.confidence_level} (${r.source_count} src, w=${r.weighted_score}) | origin: ${r.origin || '-'}`);
  }
} finally {
  await cleanup();
}
