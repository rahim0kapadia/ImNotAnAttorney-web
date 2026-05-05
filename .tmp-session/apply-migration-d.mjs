// apply-migration-d.mjs — applies 20260504d_mv_judge_docket_caseload.sql
// Run from repo root: node .tmp-session/apply-migration-d.mjs
// Uses createRequire so Node can resolve pg from ImNotAnAttorney-web/node_modules
//
// Template: .tmp-session/apply-migration-b.mjs
// Pattern: cl-bulk-data-defensive #14 (port 5432 for DDL), #17 (keepalives)

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const webRepo = path.resolve(repoRoot, '..', 'ImNotAnAttorney-web');
const require = createRequire(path.join(webRepo, 'package.json'));
const pg = require('pg');

const envPath = path.join(repoRoot, '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envFile.split('\n')) {
  const eq = line.indexOf('=');
  if (eq > 0) {
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).split('#')[0].trim();
    envVars[k] = v;
  }
}

const rawUrl = envVars['SUPABASE_DB_URL'];
if (!rawUrl) throw new Error('SUPABASE_DB_URL not set in .env.local');

const u = new URL(rawUrl);
u.port = '5432';
const connectionString = u.toString();

const { Client } = pg;

const migrationPath = path.join(repoRoot, 'supabase', 'migrations', '20260504d_mv_judge_docket_caseload.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

const logPath = path.join(__dirname, 'migrate-d.log');
const logLines = [];

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  logLines.push(line);
}

async function applyMigration() {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query(`SET statement_timeout = '30min'`);
    await c.query(`SET idle_in_transaction_session_timeout = '5min'`);
    await c.query(`SET tcp_keepalives_idle = 60`);
    await c.query(`SET tcp_keepalives_interval = 10`);
    await c.query(`SET tcp_keepalives_count = 6`);

    log('Applying 20260504d_mv_judge_docket_caseload.sql ...');
    const t0 = Date.now();
    await c.query(migrationSql);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log(`  Migration applied in ${elapsed}s`);
    return elapsed;
  } finally {
    try { await c.end(); } catch {}
  }
}

async function verifyMatview() {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    log('\nVerifying matview...');

    const countRes = await c.query(
      `SELECT COUNT(*) AS n FROM public.mv_judge_docket_caseload`
    );
    const n = countRes.rows[0].n;
    log(`  mv_judge_docket_caseload rows: ${n}`);

    // Top judges by total_dockets
    const topRes = await c.query(`
      SELECT judge_name, primary_court_id, total_dockets, criminal_dockets,
             criminal_fraction::numeric(5,3), active_dockets, years_on_bench
      FROM public.mv_judge_docket_caseload
      ORDER BY total_dockets DESC NULLS LAST
      LIMIT 5
    `);
    log('  Top 5 by total_dockets:');
    for (const r of topRes.rows) {
      log(`    ${r.judge_name || '(unnamed)'} | court=${r.primary_court_id} | total=${r.total_dockets} | crim=${r.criminal_dockets} (${r.criminal_fraction}) | active=${r.active_dockets} | yrs=${r.years_on_bench}`);
    }

    // Criminal fraction distribution
    const distRes = await c.query(`
      SELECT
        COUNT(*) FILTER (WHERE criminal_fraction >= 0.5) AS majority_criminal,
        COUNT(*) FILTER (WHERE criminal_fraction > 0 AND criminal_fraction < 0.5) AS mixed,
        COUNT(*) FILTER (WHERE criminal_fraction = 0) AS civil_only,
        AVG(total_dockets)::numeric(10,1) AS avg_dockets
      FROM public.mv_judge_docket_caseload
    `);
    const dr = distRes.rows[0];
    log(`  Crim distribution: majority_crim=${dr.majority_criminal} mixed=${dr.mixed} civil_only=${dr.civil_only} avg_dockets=${dr.avg_dockets}`);

    // Check indexes
    const idxRes = await c.query(
      `SELECT indexname FROM pg_indexes
       WHERE indexname IN ('uq_mv_jdc_judge', 'idx_mv_jdc_judge', 'idx_mv_jdc_court', 'idx_mv_jdc_criminal_frac')
       ORDER BY indexname`
    );
    const foundIdx = idxRes.rows.map(r => r.indexname);
    log(`  Indexes present: ${foundIdx.join(', ')}`);
    const allPresent = foundIdx.length === 4;
    log(`  All 4 indexes present: ${allPresent}`);

    return { n, allPresent };
  } finally {
    try { await c.end(); } catch {}
  }
}

async function main() {
  log('=== apply-migration-d.mjs START ===');
  log(`DB: ${u.hostname}:${u.port}`);

  const elapsed = await applyMigration();
  const { n, allPresent } = await verifyMatview();

  log('\n=== SUMMARY ===');
  log(`  Migration applied in: ${elapsed}s`);
  log(`  Matview rows: ${n}`);
  log(`  All indexes present: ${allPresent}`);
  log(`  Status: ${parseInt(n) > 0 && allPresent ? 'PASS' : 'FAIL'}`);

  fs.writeFileSync(logPath, logLines.join('\n') + '\n');
  log(`Log written to: ${logPath}`);

  if (parseInt(n) === 0 || !allPresent) {
    process.exit(1);
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
