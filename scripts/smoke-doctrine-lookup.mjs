// One-shot smoke test: connect via service-role key and call the
// lookup query shape to verify the index path works end-to-end.
//
// Used at TICKET-10 ship-time + as a regression check after re-runs.
import { loadDbUrl } from './lib/load-env.mjs';
process.env.SUPABASE_DB_URL ||= loadDbUrl();
import { query, end } from './lib/db.mjs';

const TARGETS = [
  // (state, doctrine_slug)
  ['FL', 'reasonable-suspicion'],
  ['FL', 'miranda-warnings'],
  ['NY', 'probable-cause'],
  ['CA', 'effective-assistance-of-counsel'],
  ['TX', 'brady-material'],
];

const FED_FALLBACK_SLUGS = [
  'reasonable-suspicion', 'miranda-warnings', 'probable-cause',
  'effective-assistance-of-counsel', 'brady-material',
];

console.log('SMOKE: doctrine lookup');
const total = await query(`SELECT COUNT(*)::int AS n FROM doctrine_opinion_quotes`);
console.log(`Total rows in doctrine_opinion_quotes: ${total[0].n}`);

const stateBreakdown = await query(`
  SELECT COALESCE(state_code, 'FED') AS state, COUNT(*)::int AS n
  FROM doctrine_opinion_quotes
  GROUP BY state_code
  ORDER BY n DESC
  LIMIT 12
`);
console.log('Top 12 states by row count:');
for (const r of stateBreakdown) console.log(`  ${r.state}: ${r.n}`);

const doctrineBreakdown = await query(`
  SELECT doctrine_slug, COUNT(*)::int AS n
  FROM doctrine_opinion_quotes
  GROUP BY doctrine_slug
  ORDER BY n DESC
`);
console.log(`Distinct doctrines covered: ${doctrineBreakdown.length}`);
for (const r of doctrineBreakdown) console.log(`  ${r.doctrine_slug}: ${r.n}`);

console.log('\nLookup samples (mimics getDoctrineSpotlights):');
for (const [state, slug] of TARGETS) {
  const rows = await query(
    `SELECT id, doctrine_slug, state_code, citation_count, relevance_score,
            SUBSTRING(quote_text FROM 1 FOR 120) AS snippet, source_url
       FROM doctrine_opinion_quotes
      WHERE doctrine_slug = $1 AND state_code = $2
      ORDER BY relevance_score DESC
      LIMIT 3`,
    [slug, state]
  );
  console.log(`\n  ${state}/${slug}: ${rows.length} state-scoped rows`);
  for (const r of rows) {
    console.log(`    [${r.state_code}, cited ${r.citation_count}x, score ${r.relevance_score}] ${r.snippet.replace(/\s+/g, ' ').trim().slice(0, 100)}...`);
    console.log(`    ${r.source_url}`);
  }
}

console.log('\nFED fallback samples:');
for (const slug of FED_FALLBACK_SLUGS) {
  const rows = await query(
    `SELECT id, citation_count, relevance_score,
            SUBSTRING(quote_text FROM 1 FOR 120) AS snippet, source_url
       FROM doctrine_opinion_quotes
      WHERE doctrine_slug = $1 AND state_code IS NULL
      ORDER BY relevance_score DESC
      LIMIT 1`,
    [slug]
  );
  if (rows.length > 0) {
    const r = rows[0];
    console.log(`  ${slug} [FED, cited ${r.citation_count}x, score ${r.relevance_score}]`);
    console.log(`    ${r.snippet.replace(/\s+/g, ' ').trim().slice(0, 100)}...`);
  }
}

await end();
console.log('\nSMOKE: done');
