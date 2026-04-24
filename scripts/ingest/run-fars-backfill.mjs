#!/usr/bin/env node
// csv-bulk-checked: https://static.nhtsa.gov/nhtsa/downloads/FARS/<year>/National/FARS<year>NationalCSV.zip
// Template: scripts/ingest/ingest-fars.mjs
// Pattern: cl-bulk-data-defensive #19 (CSV bulk before API)
//
// Sequential FARS multi-year backfill: download → extract → ingest → delete zip+extracted dir.
// Each year is idempotent (ON CONFLICT DO NOTHING on composite key).
//
// Usage:
//   node scripts/ingest/run-fars-backfill.mjs --years 2010-2022 --apply
//   node scripts/ingest/run-fars-backfill.mjs --years 2015,2016,2017 --apply
//   node scripts/ingest/run-fars-backfill.mjs --years 2022       (dry-run, single year)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
function argVal(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
const APPLY = args.includes('--apply');
const YEARS_ARG = argVal('--years') || '2010-2022';
const BULK_DIR = argVal('--dir') || 'D:\\inaa-bulk\\fars';
const KEEP = args.includes('--keep'); // don't delete zip+extract after load

function parseYears(spec) {
  if (spec.includes('-')) {
    const [a, b] = spec.split('-').map(n => parseInt(n, 10));
    const out = [];
    for (let y = a; y <= b; y++) out.push(y);
    return out;
  }
  return spec.split(',').map(n => parseInt(n.trim(), 10));
}

const YEARS = parseYears(YEARS_ARG);
console.log(`FARS backfill: ${YEARS.join(', ')} (apply=${APPLY})`);

fs.mkdirSync(BULK_DIR, { recursive: true });

function run(cmd, cmdArgs, opts = {}) {
  console.log(`  $ ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', windowsHide: true, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}`);
}

for (const year of YEARS) {
  const zipName = `FARS${year}NationalCSV.zip`;
  const zipPath = path.join(BULK_DIR, zipName);
  const extractDir = path.join(BULK_DIR, `FARS${year}NationalCSV`);
  const url = `https://static.nhtsa.gov/nhtsa/downloads/FARS/${year}/National/${zipName}`;

  console.log(`\n=== FARS ${year} ===`);

  if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 1_000_000) {
    console.log(`  download ${url}`);
    run('curl', ['-fL', '-o', zipPath, url]);
  } else {
    console.log(`  zip present (${(fs.statSync(zipPath).size / 1e6).toFixed(1)} MB)`);
  }

  if (!fs.existsSync(extractDir) || fs.readdirSync(extractDir).length === 0) {
    fs.mkdirSync(extractDir, { recursive: true });
    console.log(`  unzip → ${extractDir}`);
    // Always extract INTO the named subdir. Some years (2016+) ship the
    // zip without a top-level wrapper folder; unzipping to BULK_DIR leaves
    // CSVs loose and the next year's zip corrupts the tree. Force the wrapper.
    run('unzip', ['-q', '-o', zipPath, '-d', extractDir]);
  }
  // Some zips DO have a top-level wrapper matching the year name; after
  // forced extract we end up with extractDir/FARSxxxxNationalCSV/*.CSV.
  // Flatten one level if we see that exact shape and no CSVs at root.
  const nested = path.join(extractDir, `FARS${year}NationalCSV`);
  const rootHasCsv = fs.existsSync(extractDir) && fs.readdirSync(extractDir).some(f => /\.csv$/i.test(f));
  if (!rootHasCsv && fs.existsSync(nested) && fs.statSync(nested).isDirectory()) {
    console.log(`  flatten ${nested} → ${extractDir}`);
    for (const f of fs.readdirSync(nested)) {
      fs.renameSync(path.join(nested, f), path.join(extractDir, f));
    }
    try { fs.rmdirSync(nested); } catch {}
  }

  const loaderArgs = ['scripts/ingest/ingest-fars.mjs', '--year', String(year), '--dir', BULK_DIR];
  if (APPLY) loaderArgs.push('--apply');
  run('node', ['--env-file=.env.local', ...loaderArgs], { cwd: path.resolve(__dirname, '..', '..') });

  if (APPLY && !KEEP) {
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
    try { fs.unlinkSync(zipPath); } catch {}
    console.log(`  cleaned ${zipName} + extract dir`);
  }
}

console.log('\nFARS backfill complete.');
