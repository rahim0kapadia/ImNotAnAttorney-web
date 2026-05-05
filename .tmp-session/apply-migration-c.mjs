// apply-migration-c.mjs — applies 20260504c_mv_judge_bench_fingerprint.sql
// Run from repo root: node .tmp-session/apply-migration-c.mjs
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

// Resolve pg from ImNotAnAttorney-web/node_modules.
const webRepo = path.resolve(repoRoot, '..', 'ImNotAnAttorney-web');
const require = createRequire(path.join(webRepo, 'package.json'));
const pg = require('pg');

// Load env
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

// Session mode (port 5432) for DDL + pg_trgm-heavy matview build
const u = new URL(rawUrl);
u.port = '5432';
const connectionString = u.toString();

const { Client } = pg;

// Load the migration SQL
const migrationPath = path.join(repoRoot, 'supabase', 'migrations', '20260504c_mv_judge_bench_fingerprint.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

const logPath = path.join(__dirname, 'migrate-c.log');
const logLines = [];

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  logLines.push(line);
}

async function ensurePgTrgm() {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    log('pg_trgm extension ensured');
  } finally {
    try { await c.end(); } catch {}
  }
}

async function applyMigration() {
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query(`SET statement_timeout = '10min'`);
    await c.query(`SET idle_in_transaction_session_timeout = '5min'`);
    await c.query(`SET tcp_keepalives_idle = 60`);
    await c.query(`SET tcp_keepalives_interval = 10`);
    await c.query(`SET tcp_keepalives_count = 6`);

    log('Applying 20260504c_mv_judge_bench_fingerprint.sql ...');
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
      `SELECT COUNT(*) AS n FROM public.mv_judge_bench_fingerprint`
    );
    const n = countRes.rows[0].n;
    log(`  mv_judge_bench_fingerprint rows: ${n}`);

    // Sample top rows by ussc_total_cases
    const topRes = await c.query(`
      SELECT profile_name, district, ussc_total_cases,
             median_sentence_months, downward_departure_rate::numeric(5,3),
             name_similarity::numeric(4,3), federal_docket_count
      FROM public.mv_judge_bench_fingerprint
      ORDER BY ussc_total_cases DESC NULLS LAST
      LIMIT 5
    `);
    log('  Top 5 by ussc_total_cases:');
    for (const r of topRes.rows) {
      log(`    ${r.profile_name} | dist=${r.district} | ussc=${r.ussc_total_cases} | med=${r.median_sentence_months}mo | dep=${r.downward_departure_rate} | sim=${r.name_similarity} | dockets=${r.federal_docket_count}`);
    }

    // Check indexes
    const idxRes = await c.query(
      `SELECT indexname FROM pg_indexes
       WHERE indexname IN ('uq_mv_jbf_judge', 'idx_mv_jbf_judge', 'idx_mv_jbf_district')
       ORDER BY indexname`
    );
    const foundIdx = idxRes.rows.map(r => r.indexname);
    log(`  Indexes present: ${foundIdx.join(', ')}`);

    const allPresent = foundIdx.length === 3;
    log(`  All 3 indexes present: ${allPresent}`);

    // Sample name_similarity distribution
    const simRes = await c.query(`
      SELECT
        COUNT(*) FILTER (WHERE name_similarity >= 0.8) AS sim_high,
        COUNT(*) FILTER (WHERE name_similarity >= 0.5 AND name_similarity < 0.8) AS sim_med,
        COUNT(*) FILTER (WHERE name_similarity < 0.5) AS sim_low
      FROM public.mv_judge_bench_fingerprint
    `);
    const sr = simRes.rows[0];
    log(`  Similarity dist: high(>=0.8)=${sr.sim_high} med(0.5-0.8)=${sr.sim_med} low(<0.5)=${sr.sim_low}`);

    return { n, allPresent };
  } finally {
    try { await c.end(); } catch {}
  }
}

async function main() {
  log('=== apply-migration-c.mjs START ===');
  log(`DB: ${u.hostname}:${u.port}`);

  await ensurePgTrgm();
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
