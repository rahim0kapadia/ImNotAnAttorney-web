// Audit: anti-hallucination check for MO/WI/LA bar discipline events.
// Verifies every row has source_url + HTTPS, and per-jurisdiction counts ≥10.
//
// Usage:
//   node --env-file=.env.local scripts/diag-bar-disc-batch2-audit.mjs

import pg from 'pg';

const conn = process.env.SUPABASE_DB_URL;
if (!conn) {
  console.error('SUPABASE_DB_URL missing');
  process.exit(1);
}

const u = new URL(conn);
u.port = '5432';

const c = new pg.Client({
  connectionString: u.toString(),
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const states = ['MO', 'WI', 'LA'];
const issues = [];

for (const j of states) {
  const r1 = await c.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE source_url IS NULL)::int AS null_src,
            COUNT(*) FILTER (WHERE source_url NOT LIKE 'https://%')::int AS non_https,
            COUNT(*) FILTER (WHERE order_url IS NOT NULL AND order_url NOT LIKE 'https://%')::int AS non_https_order,
            MIN(order_date) AS min_date,
            MAX(order_date) AS max_date,
            COUNT(DISTINCT bar_number)::int AS distinct_attorneys
     FROM public.attorney_discipline_events
     WHERE jurisdiction = $1`,
    [j],
  );
  const row = r1.rows[0];
  const status = (row.null_src === 0 && row.non_https === 0 && row.non_https_order === 0 && row.total >= 10) ? 'OK' : 'FAIL';
  if (status !== 'OK') issues.push({ jurisdiction: j, ...row });
  console.log(
    `${j}: total=${row.total}  null_src=${row.null_src}  non_https=${row.non_https}  non_https_order=${row.non_https_order}  distinct_attorneys=${row.distinct_attorneys}  range=${row.min_date}..${row.max_date}  → ${status}`,
  );
}

// Cross-state totals
const tot = await c.query(`
  SELECT COUNT(*)::int AS rows, COUNT(DISTINCT jurisdiction)::int AS jurs
  FROM public.attorney_discipline_events
`);
console.log(`\nGlobal: total_rows=${tot.rows[0].rows}  jurisdictions=${tot.rows[0].jurs}`);

// Sample sanity: name + url shapes
for (const j of states) {
  const r2 = await c.query(
    `SELECT full_name, order_date, discipline_type, source_url, order_url
     FROM public.attorney_discipline_events
     WHERE jurisdiction = $1
     ORDER BY scraped_at DESC NULLS LAST
     LIMIT 3`,
    [j],
  );
  console.log(`\n${j} sample:`);
  for (const row of r2.rows) {
    console.log(`  · ${row.full_name} | ${row.order_date} | ${row.discipline_type} | source=${row.source_url} | order=${row.order_url}`);
  }
}

await c.end();

if (issues.length > 0) {
  console.error(`\nFAIL — ${issues.length} jurisdictions with audit issues`);
  process.exit(2);
}
console.log('\nALL CLEAR — anti-hallucination audit passed for MO/WI/LA');
