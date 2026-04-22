// Template: scripts/ingest/wikidata-verification-urls-ext.mjs
// Pattern: cl-bulk-data-defensive #19 (free API before paid) — Wikipedia REST API
// Expert: lukas-fittl (small UPSERT via parameterized batch)
//
// Backfill entities_agencies.acronym from Wikipedia first-paragraph extract.
//
// Source URL per agency is already in entity_sources (source_system='wikipedia').
// Wikipedia page title derived from URL segment after /wiki/.
// Wikipedia REST API /api/rest_v1/page/summary/<title> returns extract + description.
//
// Parse acronym via regex on extract: "The Federal Bureau of Investigation (FBI) is..."
// captures "FBI".
//
// Rate limit: 250ms between requests (4 req/s, well under Wikipedia's 200 req/s limit).

import { createBulkClient } from '../lib/pg-bulk-defaults.mjs';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const WP_BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const DELAY_MS = 250;
const USER_AGENT = 'ImNotAnAttorney/1.0 (https://imnotanattorney.com; legal-research)';

// Match "(FBI)" or "(ATF)" or "(BATFE)" — 2-7 uppercase letters/digits.
// No \b before '(' — \b between space and '(' is not a word boundary in JS regex.
const ACRONYM_RE = /\(([A-Z][A-Z0-9]{1,6})\)/;

async function fetchWpExtract(pageTitle) {
  const url = `${WP_BASE}/${encodeURIComponent(pageTitle)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia ${res.status} on ${pageTitle}`);
  const j = await res.json();
  return j.extract || j.description || '';
}

function extractAcronym(text) {
  if (!text) return null;
  const m = text.match(ACRONYM_RE);
  return m ? m[1] : null;
}

function deriveTitle(url) {
  // https://en.wikipedia.org/wiki/Federal_Bureau_of_Investigation -> "Federal_Bureau_of_Investigation"
  const u = new URL(url);
  const parts = u.pathname.split('/');
  const title = parts[parts.length - 1];
  return decodeURIComponent(title);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const { client: c, cleanup } = await createBulkClient({
  workMemMB: 64,
  statementTimeout: '5min'
});

try {
  console.log(`=== backfill-agency-acronyms ${new Date().toISOString()} ===`);

  const rows = await c.query(`
    SELECT ea.canonical_id, ea.name, ea.acronym, es.source_url
    FROM entities_agencies ea
    JOIN entity_sources es
      ON es.entity_id = ea.canonical_id
     AND es.entity_type = 'agency'
     AND es.source_system = 'wikipedia'
    WHERE ea.acronym IS NULL
      AND es.source_url IS NOT NULL
    ORDER BY ea.name
  `);
  console.log(`agencies needing acronym backfill: ${rows.rowCount}`);

  let hits = 0, misses = 0, errors = 0;
  const results = [];

  for (const r of rows.rows) {
    try {
      const title = deriveTitle(r.source_url);
      const extract = await fetchWpExtract(title);
      const acronym = extractAcronym(extract);
      if (acronym) {
        hits++;
        results.push({ canonical_id: r.canonical_id, name: r.name, acronym });
        console.log(`  [OK]  ${r.name.padEnd(50)} -> ${acronym}`);
      } else {
        misses++;
        console.log(`  [..]  ${r.name.padEnd(50)} -> (no acronym found)`);
      }
    } catch (err) {
      errors++;
      console.log(`  [ERR] ${r.name.padEnd(50)} -> ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nHits: ${hits} | Misses: ${misses} | Errors: ${errors}`);

  // Batch UPDATE
  if (results.length > 0) {
    const ids = results.map(r => r.canonical_id);
    const acronyms = results.map(r => r.acronym);
    const upd = await c.query(`
      UPDATE entities_agencies AS ea
      SET acronym = u.acronym, created_at = created_at
      FROM UNNEST($1::uuid[], $2::text[]) AS u(canonical_id, acronym)
      WHERE ea.canonical_id = u.canonical_id
      RETURNING 1
    `, [ids, acronyms]);
    console.log(`UPDATE affected ${upd.rowCount} rows`);
  }

  // Final state
  const final = await c.query(`
    SELECT count(*) total, count(acronym) with_acronym FROM entities_agencies
  `);
  console.log(`\nFinal: ${final.rows[0].with_acronym} / ${final.rows[0].total} agencies have acronym`);

  // Sample
  const sample = await c.query(`
    SELECT name, acronym FROM entities_agencies WHERE acronym IS NOT NULL ORDER BY name LIMIT 20
  `);
  console.log('\nTop 20 agencies with acronyms:');
  for (const r of sample.rows) console.log(`  ${r.acronym.padStart(6)}  ${r.name}`);
} finally {
  await cleanup();
}
