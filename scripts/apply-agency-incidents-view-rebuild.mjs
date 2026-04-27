/**
 * apply-agency-incidents-view-rebuild.mjs — re-apply
 * supabase/migrations/20260426a_agency_incidents_view.sql via the Supabase
 * Management API (no exec_sql RPC available on hosted Supabase).
 *
 * Why re-apply: PR #180 review W4 + S1 + S5 changed the view's source_urls
 * aggregation (LATERAL unnest CTE) and migration shape (CREATE OR REPLACE).
 * Production view must be rebuilt to match the source migration.
 *
 * Pattern source: scripts/apply-platform-posts-migration.mjs (cached template).
 *
 * Plan: docs/plans/2026-04-26-pr-180-review-fixes.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.resolve(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8')
  .split('\n')
  .filter(l => l && !l.trimStart().startsWith('#'))
  .reduce((m, l) => {
    const i = l.indexOf('=');
    if (i > 0) m[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    return m;
  }, {});

const SUPABASE_ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;
if (!SUPABASE_ACCESS_TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN in ImNotAnAttorney-web/.env.local');
  process.exit(1);
}

const PROJECT_REF = 'jxjbjmgdukwkoclydqdr';

const migrationPath = path.resolve(
  __dirname,
  '..',
  'supabase',
  'migrations',
  '20260426a_agency_incidents_view.sql'
);
const sql = fs.readFileSync(migrationPath, 'utf8');

async function runQuery(query, label) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'inaa-apply-migration/1.0',
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    console.error(`${label} failed (${res.status}):`, text.slice(0, 2000));
    process.exit(2);
  }
  return text;
}

console.log('Step 1: applying view migration...');
const migrationOut = await runQuery(sql, 'Migration');
console.log('  applied:', migrationOut.slice(0, 200));

console.log('Step 2: row-count check (expect ~5,342 agencies)...');
const countOut = await runQuery(
  'SELECT COUNT(*)::int AS n FROM agency_incidents;',
  'Row count',
);
console.log('  count:', countOut.slice(0, 200));

console.log('Step 3: per-state spot-check (CA / TX / NY)...');
const stateOut = await runQuery(
  `SELECT state, COUNT(*)::int AS n
   FROM agency_incidents
   WHERE state IN ('CA','TX','NY','HI','PR')
   GROUP BY state ORDER BY state;`,
  'State spot-check',
);
console.log('  per-state:', stateOut.slice(0, 400));

console.log('Step 4: perf check (CA query, target <1s server-side)...');
const t0 = Date.now();
const caOut = await runQuery(
  `SELECT agency, use_of_force_count, source_urls
   FROM agency_incidents
   WHERE state = 'CA'
   ORDER BY use_of_force_count DESC
   LIMIT 20;`,
  'CA perf',
);
const elapsed = Date.now() - t0;
console.log(`  elapsed (round-trip): ${elapsed}ms`);
console.log('  sample:', caOut.slice(0, 400));

console.log('\nAll steps passed. agency_incidents view rebuilt and verified.');
