#!/usr/bin/env node
// Template: scripts/ingest/ingest-openpolicing.mjs
// Pattern: cl-bulk-data-defensive #3 (never two Node CSV streamers concurrently)
//
// Sequential Stanford OPP state loader. Walks states one at a time, waits for
// each to exit cleanly before starting next. Skips states already present in
// public.police_stops (queries count by state_code, skips if ≥ expected min).
//
// Usage:
//   node scripts/ingest/run-opp-sequential.mjs --states oh,wa,il,co,wi --apply
//   node scripts/ingest/run-opp-sequential.mjs --apply          # default queue
//
// After each state: deletes extract dir (.d/) to reclaim D:\. Keeps zip so
// re-runs are cache-hit.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
function argVal(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
const APPLY = args.includes('--apply');
const STATES_ARG = argVal('--states') || 'oh,wa,il,co,wi';
const BULK_DIR = argVal('--dir') || 'D:\\inaa-bulk\\openpolicing';
const MIN_EXPECTED = parseInt(argVal('--min-rows') || '500000', 10);

const STATES = STATES_ARG.split(',').map(s => s.trim().toLowerCase());

console.log(`OPP sequential: ${STATES.join(' → ')} (apply=${APPLY})`);

async function stateLoadedCount(code) {
  const { default: pg } = await import('pg');
  const u = new URL(process.env.SUPABASE_DB_URL);
  u.port = '5432';
  const c = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query("SET statement_timeout='600s'");
    await c.query("SET idle_in_transaction_session_timeout='5min'");
    await c.query("SET tcp_keepalives_idle=60");
    await c.query("SET tcp_keepalives_interval=10");
    await c.query("SET tcp_keepalives_count=6");
    const r = await c.query(
      'SELECT COUNT(*)::bigint AS n FROM public.police_stops WHERE state_code = $1',
      [code.toUpperCase()]
    );
    return Number(r.rows[0].n);
  } finally {
    try { await c.end(); } catch {}
  }
}

function run(cmd, cmdArgs, opts = {}) {
  console.log(`  $ ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', windowsHide: true, ...opts });
  return r.status;
}

for (const state of STATES) {
  const agency = `${state}_statewide`;
  console.log(`\n=== ${agency} ===`);

  const loaded = await stateLoadedCount(state);
  if (loaded >= MIN_EXPECTED) {
    console.log(`  SKIP — already loaded (${loaded.toLocaleString()} rows ≥ ${MIN_EXPECTED.toLocaleString()})`);
    continue;
  }
  console.log(`  current loaded: ${loaded.toLocaleString()} rows — running loader`);

  const loaderArgs = ['scripts/ingest/ingest-openpolicing.mjs', '--agency', agency, '--dir', BULK_DIR];
  if (APPLY) loaderArgs.push('--apply');
  const exit = run('node', ['--env-file=.env.local', ...loaderArgs], { cwd: REPO_ROOT });
  if (exit !== 0) {
    console.error(`  FAIL on ${agency} (exit ${exit}) — halting queue.`);
    process.exit(exit);
  }

  // Reclaim extract dir (keep zip for re-run safety)
  const extractDir = path.join(BULK_DIR, `${agency}.d`);
  try {
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
      console.log(`  reclaimed ${extractDir}`);
    }
  } catch {}
}

console.log('\nOPP sequential complete.');
