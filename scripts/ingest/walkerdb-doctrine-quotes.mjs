// Template: scripts/ingest/wikidata-statutes-doctrines-forensics.mjs
// Expert: lukas-fittl (in-DB aggregation via INSERT...SELECT, UNLOGGED staging)
// Pattern: cl-bulk-data-defensive #17 (Albe session defenses)
//
// Walkerdb SCOTUS doctrine-quote extraction.
//
// scotus_transcripts has 1,839,093 speaker turns across 8,271 oral arguments
// (walkerdb-internal case_ids 12990-25940; no stable join to entities_cases
// today — case-level linkage is a future pass, see follow-ups). For this
// session the unlock is verbatim Justice / advocate pull-quotes searchable
// by doctrine name via the existing GIN FTS index on scotus_transcripts.text.
//
// Output:
//   1. Table doctrine_quotes: top-N quotes per doctrine with ts_rank scoring
//   2. entity_sources: one walkerdb row per doctrine that has >=1 quote,
//      promoting doctrines from 'medium' (wikidata + wikipedia) to 'high'
//      (weight 3.0 primary source added).

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

// Per-doctrine FTS search terms. Primary term is always the doctrine name; a few
// doctrines get synonym expansion where the legal jargon differs from the
// doctrine's formal name.
const DOCTRINE_TERMS = {
  'Miranda warning':                                ['Miranda warning', 'Miranda rights'],
  'Terry stop':                                     ['Terry stop', 'stop and frisk'],
  'exclusionary rule':                              ['exclusionary rule'],
  'fruit of the poisonous tree':                    ['fruit of the poisonous tree'],
  'inevitable discovery':                           ['inevitable discovery'],
  'plain view doctrine':                            ['plain view doctrine'],
  'probable cause':                                 ['probable cause'],
  'reasonable suspicion':                           ['reasonable suspicion'],
  'search warrant':                                 ['search warrant'],
  'Confrontation Clause':                           ['Confrontation Clause'],
  'Strickland v. Washington':                       ['Strickland v. Washington', 'ineffective assistance of counsel'],
  'Fourth Amendment to the United States Constitution':  ['Fourth Amendment'],
  'Fifth Amendment to the United States Constitution':   ['Fifth Amendment'],
  'Sixth Amendment to the United States Constitution':   ['Sixth Amendment'],
  'Eighth Amendment to the United States Constitution':  ['Eighth Amendment', 'cruel and unusual'],
  'alibi':                                          ['alibi defense'],
  'entrapment':                                     ['entrapment defense', 'entrapment'],
  'insanity defense':                               ['insanity defense'],
  'right of self-defense':                          ['self-defense', 'right of self-defense'],
  'Brady disclosure':                               ['Brady disclosure', 'Brady material', 'Brady violation'],
  'chain of custody':                               ['chain of custody'],
  'Daubert standard':                               ['Daubert standard', 'Daubert hearing'],
  'Frye standard':                                  ['Frye standard', 'Frye test'],
  'Alford plea':                                    ['Alford plea'],
  'nolo contendere':                                ['nolo contendere'],
  'habeas corpus':                                  ['habeas corpus'],
  'statute of limitations':                         ['statute of limitations'],
  'Apprendi v. New Jersey':                         ['Apprendi v. New Jersey', 'Apprendi rule'],
  'mandatory sentencing':                           ['mandatory sentencing', 'mandatory minimum'],
  'United States Federal Sentencing Guidelines':    ['Federal Sentencing Guidelines', 'Sentencing Guidelines'],
  'jury nullification':                             ['jury nullification'],
  'mistrial':                                       ['mistrial'],
  'presumption of innocence':                       ['presumption of innocence'],
  'reasonable doubt':                               ['reasonable doubt', 'beyond a reasonable doubt'],
  'voir dire':                                      ['voir dire'],
  'double jeopardy':                                ['double jeopardy'],
};

const TOP_N_PER_TERM = 15;          // quotes per search term (deduped per turn)
const MIN_QUOTE_LEN = 80;           // drop tiny fragments
const MAX_QUOTE_LEN = 1200;         // drop speechifying turns

const { client: c, cleanup } = await createBulkClient({
  workMemMB: 256,
  maintWorkMemMB: 1024,
  statementTimeout: '30min'
});

try {
  console.log(`=== walkerdb-doctrine-quotes ${new Date().toISOString()} ===`);

  // Create table (idempotent)
  await c.query(`
    CREATE TABLE IF NOT EXISTS doctrine_quotes (
      doctrine_id UUID NOT NULL REFERENCES entities_legal_doctrines(canonical_id) ON DELETE CASCADE,
      transcript_case_id TEXT NOT NULL,
      section_index INT NOT NULL,
      turn_index INT NOT NULL,
      speaker TEXT,
      quote_text TEXT NOT NULL,
      matched_term TEXT NOT NULL,
      ts_rank REAL NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (doctrine_id, transcript_case_id, section_index, turn_index, matched_term)
    );
    CREATE INDEX IF NOT EXISTS idx_doctrine_quotes_doctrine ON doctrine_quotes(doctrine_id, ts_rank DESC);
    CREATE INDEX IF NOT EXISTS idx_doctrine_quotes_speaker ON doctrine_quotes(speaker) WHERE speaker IS NOT NULL;
  `);

  // Load doctrines
  const doctrines = (await c.query(`SELECT canonical_id, name FROM entities_legal_doctrines ORDER BY name`)).rows;
  console.log(`${doctrines.length} doctrines loaded`);

  // Pre-load
  const pre = await c.query(`SELECT count(*) n FROM doctrine_quotes`);
  console.log(`pre-load doctrine_quotes rows: ${pre.rows[0].n}`);

  let totalQuotes = 0;
  const hits = [];

  for (const d of doctrines) {
    const terms = DOCTRINE_TERMS[d.name];
    if (!terms || terms.length === 0) {
      console.log(`  [skip] ${d.name}: no search terms mapped`);
      continue;
    }

    let perDoctrine = 0;
    for (const term of terms) {
      // Use plainto_tsquery via english config; rank by ts_rank against gin index
      const res = await c.query(`
        WITH ranked AS (
          SELECT case_id, section_index, turn_index, speaker, text,
                 ts_rank(to_tsvector('english', COALESCE(text,'')), plainto_tsquery('english', $1)) AS r
          FROM scotus_transcripts
          WHERE to_tsvector('english', COALESCE(text,'')) @@ plainto_tsquery('english', $1)
            AND length(text) BETWEEN $2 AND $3
          ORDER BY r DESC
          LIMIT $4
        )
        INSERT INTO doctrine_quotes (
          doctrine_id, transcript_case_id, section_index, turn_index, speaker, quote_text, matched_term, ts_rank
        )
        SELECT $5::uuid, case_id, section_index, turn_index, speaker, text, $1, r
        FROM ranked
        ON CONFLICT (doctrine_id, transcript_case_id, section_index, turn_index, matched_term) DO NOTHING
        RETURNING 1
      `, [term, MIN_QUOTE_LEN, MAX_QUOTE_LEN, TOP_N_PER_TERM, d.canonical_id]);
      perDoctrine += res.rowCount;
    }
    totalQuotes += perDoctrine;
    hits.push({ name: d.name, canonical_id: d.canonical_id, quotes: perDoctrine });
    console.log(`  [+${String(perDoctrine).padStart(3)}] ${d.name}`);
  }

  console.log(`\nTotal quotes inserted: ${totalQuotes}`);

  // entity_sources fan-out — one walkerdb source per doctrine with quotes
  console.log('\nAdding walkerdb entity_sources for doctrines with quotes...');
  const ins = await c.query(`
    INSERT INTO entity_sources (
      entity_type, entity_id, source_system, source_ref, source_url,
      retrieved_at, raw_table, raw_row_id
    )
    SELECT DISTINCT
      'doctrine',
      dq.doctrine_id,
      'walkerdb',
      'doctrine:' || eld.name,
      'https://github.com/walkerdb/supreme_court_transcripts',
      NOW(),
      'scotus_transcripts',
      'doctrine:' || eld.canonical_id::text
    FROM doctrine_quotes dq
    JOIN entities_legal_doctrines eld ON eld.canonical_id = dq.doctrine_id
    ON CONFLICT (entity_type, entity_id, source_system, source_ref) DO NOTHING
    RETURNING 1
  `);
  console.log(`Inserted ${ins.rowCount} walkerdb entity_sources rows`);

  // Verify v_entity_confidence shift for doctrines
  const conf = await c.query(`
    SELECT confidence_level, count(*) n, MIN(source_count) mn, MAX(source_count) mx, AVG(weighted_score)::numeric(10,2) avg_w
    FROM v_entity_confidence
    WHERE entity_type='doctrine'
    GROUP BY 1
    ORDER BY MIN(source_count)
  `);
  console.log('\ndoctrine confidence distribution post-load:');
  for (const r of conf.rows) {
    console.log(`  ${r.confidence_level}: ${r.n} doctrines | src: ${r.mn}-${r.mx} | avg weight: ${r.avg_w}`);
  }

  // Top doctrines by quote count
  const topDoctrines = await c.query(`
    SELECT eld.name, eld.category, count(*) n
    FROM doctrine_quotes dq
    JOIN entities_legal_doctrines eld ON eld.canonical_id = dq.doctrine_id
    GROUP BY eld.name, eld.category
    ORDER BY n DESC
    LIMIT 15
  `);
  console.log('\nTop 15 doctrines by quote count:');
  for (const r of topDoctrines.rows) {
    console.log(`  ${String(r.n).padStart(4)} — ${r.category} — ${r.name}`);
  }

  // Sample Miranda quotes
  const sample = await c.query(`
    SELECT dq.speaker, dq.transcript_case_id, dq.ts_rank::numeric(5,3) r, substring(dq.quote_text, 1, 200) t
    FROM doctrine_quotes dq
    JOIN entities_legal_doctrines eld ON eld.canonical_id = dq.doctrine_id
    WHERE eld.name = 'Miranda warning'
    ORDER BY dq.ts_rank DESC
    LIMIT 5
  `);
  console.log('\nSample Miranda warning top-5 quotes:');
  for (const r of sample.rows) {
    console.log(`  [case ${r.transcript_case_id}] rank=${r.r} ${r.speaker || 'unknown'}: ${r.t}`);
  }
} finally {
  await cleanup();
}
