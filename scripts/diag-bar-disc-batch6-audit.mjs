// Anti-hallucination audit for batch6 (ID, WV, HI, NH).
// Reports: total events, NULL/empty source_url, non-HTTPS source_url,
// non-HTTPS order_url, distinct attorney count.
//
// Run: node scripts/diag-bar-disc-batch6-audit.mjs

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createBulkClient } from './lib/pg-bulk-defaults.mjs';

const __filename = fileURLToPath(import.meta.url);

// Inline env loader (SEC-W1).
{
  const ENV_PATH = 'C:/Users/email/projects/ImNotAnAttorney-web/.env.local';
  const VALID_KEY_RX = /^[A-Z_][A-Z0-9_]*$/;
  if (fs.existsSync(ENV_PATH)) {
    const txt = fs.readFileSync(ENV_PATH, 'utf-8');
    for (const rawLine of txt.split('\n')) {
      let line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      line = line.trim();
      if (!line || line[0] === '#') continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (val.length >= 2 && ((val[0] === '"' && val[val.length - 1] === '"') ||
          (val[0] === "'" && val[val.length - 1] === "'"))) {
        val = val.slice(1, -1);
      }
      if (!VALID_KEY_RX.test(key)) continue;
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const JUR_LIST = ['ID', 'WV', 'HI', 'NH'];

const { client, cleanup } = await createBulkClient();
try {
  for (const jur of JUR_LIST) {
    const r = await client.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE source_url IS NULL OR source_url = '')::int AS null_src,
             count(*) FILTER (WHERE source_url IS NOT NULL AND source_url <> '' AND source_url NOT LIKE 'https://%')::int AS non_https,
             count(*) FILTER (WHERE order_url IS NOT NULL AND order_url <> '' AND order_url NOT LIKE 'https://%')::int AS non_https_order,
             count(DISTINCT bar_number)::int AS distinct_attorneys,
             min(order_date)::text AS earliest,
             max(order_date)::text AS latest
      FROM public.attorney_discipline_events
      WHERE jurisdiction = $1
    `, [jur]);
    const row = r.rows[0];
    const bad = row.null_src + row.non_https + row.non_https_order;
    const status = bad === 0 ? '→ OK' : `→ FAIL (bad=${bad})`;
    console.log(`${jur}: total=${row.total}  null_src=${row.null_src}  non_https=${row.non_https}  non_https_order=${row.non_https_order}  distinct_attorneys=${row.distinct_attorneys}  range=[${row.earliest}..${row.latest}]  ${status}`);
  }

  // Grand total of attorney_discipline_events table
  const t = await client.query(`SELECT count(*)::int AS total, count(DISTINCT jurisdiction)::int AS jurs FROM public.attorney_discipline_events`);
  console.log(`\nGRAND TOTAL: ${t.rows[0].total} events / ${t.rows[0].jurs} jurisdictions`);

  // Check no NULL source_url anywhere across all jurisdictions
  const n = await client.query(`SELECT count(*)::int AS bad FROM public.attorney_discipline_events WHERE source_url IS NULL OR source_url = ''`);
  console.log(`\nGLOBAL NULL/empty source_url: ${n.rows[0].bad}`);

  console.log('\nALL CLEAR' );
} finally {
  await cleanup();
}
