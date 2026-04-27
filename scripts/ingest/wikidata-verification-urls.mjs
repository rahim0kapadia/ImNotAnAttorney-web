// Template: scripts/ingest/fjc-refresh.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — Wikidata is a SPARQL endpoint (no bulk CSV equivalent for the cross-reference queries we need)
//
// C3 — Wikidata SPARQL verification-URL layer (JUDGES only for v1).
// Pulls Wikidata + Wikipedia + Ballotpedia URLs for every federal judge we track
// (match via FJC ID P2736) and writes them as entity_sources rows so the
// "verified by N public sources" confidence badge can render on every
// Judge Report Card + X-Ray judge profile.
//
// License: CC0 — no attribution required, commercial OK.
// Endpoint: https://query.wikidata.org/sparql
// Rate: ~1 req/sec soft; 5 retries with exponential backoff.

import { createBulkClient, bulkCopyRows } from '../lib/pg-bulk-defaults.mjs';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const UA = 'INAA-data-pipeline/1.0 (https://imnotanattorney.com; contact admin@imnotanattorney.com)';
const ENDPOINT = 'https://query.wikidata.org/sparql';

async function sparql(query) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(ENDPOINT + '?format=json&query=' + encodeURIComponent(query), {
      headers: { 'Accept': 'application/sparql-results+json', 'User-Agent': UA },
    });
    if (res.ok) return (await res.json()).results.bindings;
    if (res.status === 429 || res.status >= 500) {
      const wait = 2 ** attempt * 1000;
      console.warn(`  wikidata ${res.status} — retry in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    throw new Error(`sparql ${res.status}: ${await res.text()}`);
  }
  throw new Error('sparql: exhausted retries');
}

const val = (b, k) => b[k]?.value || null;

// P2736 = FJC judge ID. Returns every Wikidata item with an FJC ID + optional
// Wikipedia/Ballotpedia cross-references.
const JUDGE_QUERY = `
SELECT ?fjcId ?person ?wikipedia ?ballotpediaPath WHERE {
  ?person wdt:P2736 ?fjcId .
  OPTIONAL {
    ?wikipedia schema:about ?person ;
               schema:inLanguage "en" ;
               schema:isPartOf <https://en.wikipedia.org/> .
  }
  OPTIONAL { ?person wdt:P2390 ?ballotpediaPath }
}
`;

const { client, cleanup } = await createBulkClient({
  workMemMB: 256, maintWorkMemMB: 256, statementTimeout: '15min',
});

try {
  console.log(`=== C3 wikidata-verification-urls (judges) ${new Date().toISOString()} ===`);

  console.log(`[1/4] SPARQL query — all Wikidata items with FJC ID ...`);
  const rows = await sparql(JUDGE_QUERY);
  console.log(`  ${rows.length} Wikidata judge entries`);

  console.log(`[2/4] Load local entities_judges slug -> canonical_id map ...`);
  // Wikidata P2736 is the FJC URL slug (last-first[-middle]), NOT the numeric nid.
  const toSlug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const { rows: judgeRows } = await client.query(
    `SELECT canonical_id::text AS cid, name_first, name_middle, name_last
       FROM entities_judges
      WHERE fjc_id IS NOT NULL AND name_last IS NOT NULL`
  );
  const slugToUuid = new Map();
  for (const r of judgeRows) {
    const parts = [r.name_last, r.name_first, r.name_middle].filter(Boolean).map(toSlug).filter(Boolean);
    if (parts.length < 2) continue;
    const slugFull = parts.join('-');
    const slugShort = parts.slice(0, 2).join('-');
    if (!slugToUuid.has(slugFull)) slugToUuid.set(slugFull, r.cid);
    if (!slugToUuid.has(slugShort)) slugToUuid.set(slugShort, r.cid);
  }
  console.log(`  ${slugToUuid.size} slug variants from ${judgeRows.length} judges`);

  console.log(`[3/4] Map Wikidata rows to entity_sources tuples ...`);
  const sources = [];
  let matched = 0;
  for (const r of rows) {
    const slug = val(r, 'fjcId')?.toLowerCase();
    const uuid = slugToUuid.get(slug);
    if (!uuid) continue;
    matched++;
    const qid = val(r, 'person')?.replace('http://www.wikidata.org/entity/', '');
    if (qid) sources.push(['judge', uuid, 'wikidata', `https://www.wikidata.org/wiki/${qid}`]);
    const wp = val(r, 'wikipedia');
    if (wp) sources.push(['judge', uuid, 'wikipedia', wp]);
    const bp = val(r, 'ballotpediaPath');
    if (bp) sources.push(['judge', uuid, 'ballotpedia', `https://ballotpedia.org/${bp}`]);
  }
  console.log(`  matched ${matched} Wikidata entries to local judges`);
  console.log(`  ${sources.length} entity_sources tuples to upsert`);

  if (sources.length === 0) {
    console.log('  nothing to upsert. exiting.');
    process.exit(0);
  }

  console.log(`[4/4] Stage + insert (NOT EXISTS skip-duplicates) ...`);
  await client.query(`DROP TABLE IF EXISTS _wikidata_sources_stage`);
  await client.query(`
    CREATE UNLOGGED TABLE _wikidata_sources_stage (
      entity_type TEXT,
      entity_id UUID,
      source_system TEXT,
      source_url TEXT
    )
  `);
  async function* gen() { for (const r of sources) yield r; }
  const copyRes = await bulkCopyRows(
    client,
    '_wikidata_sources_stage',
    ['entity_type', 'entity_id', 'source_system', 'source_url'],
    gen()
  );
  console.log(`  staged ${copyRes.rowCount.toLocaleString()} rows`);

  const upsert = await client.query(`
    INSERT INTO entity_sources (entity_type, entity_id, source_system, source_url)
    SELECT entity_type, entity_id, source_system, source_url
      FROM _wikidata_sources_stage s
     WHERE NOT EXISTS (
       SELECT 1 FROM entity_sources es
        WHERE es.entity_type = s.entity_type
          AND es.entity_id = s.entity_id
          AND es.source_system = s.source_system
          AND es.source_url = s.source_url
     )
  `);
  console.log(`  inserted ${upsert.rowCount.toLocaleString()} new entity_sources rows (duplicates skipped)`);

  await client.query(`DROP TABLE _wikidata_sources_stage`);

  const { rows: [tot] } = await client.query(
    `SELECT
       count(*) FILTER (WHERE source_system='wikidata')    AS wd,
       count(*) FILTER (WHERE source_system='wikipedia')   AS wp,
       count(*) FILTER (WHERE source_system='ballotpedia') AS bp
     FROM entity_sources WHERE entity_type='judge'`
  );
  console.log(`\n  judge entity_sources totals: wikidata=${tot.wd} wikipedia=${tot.wp} ballotpedia=${tot.bp}`);
} finally { await cleanup(); }
