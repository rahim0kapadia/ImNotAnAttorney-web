// Template: scripts/cl-bulk-loader.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #18 + #19
// csv-bulk-checked: https://www.fjc.gov/history/judges/biographical-directory-article-iii-federal-judges-export
//
// A1 — FJC missing-URL refresh. Root cause: FJC renamed filenames _ -> - in 2025-2026.
// Existing fjc_service / fjc_other_service / fjc_other_nominations / fjc_prof_career
// tables were populated from the old underscore URLs and have been returning 404 on
// refresh. This script refetches from the current hyphenated URLs, DROPs stale schemas,
// and recreates all-TEXT tables with proper snake_case column names derived from live
// CSV headers. Run when Phase 1 opinions load is NOT building indexes (no IO conflict).

import { createBulkClient, bulkCopyCsv } from '../lib/pg-bulk-defaults.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const FJC_BASE = 'https://www.fjc.gov/sites/default/files/history';
const TMPDIR = path.join(os.tmpdir(), 'fjc-refresh');

const SOURCES = [
  { table: 'fjc_service',          file: 'federal-judicial-service.csv' },
  { table: 'fjc_other_service',    file: 'other-federal-judicial-service.csv' },
  { table: 'fjc_other_nominations', file: 'other-nominations-recess.csv' },
  { table: 'fjc_prof_career',      file: 'professional-career.csv' },
];

function normalize(col, idx) {
  const n = col
    .replace(/^"|"$/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'c_$1');
  return n || `col_${idx}`;
}

async function download(url, dest) {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  return new Promise((resolve, reject) => {
    const p = spawn('curl', ['-sSL', '--fail', '--retry', '3', '-o', dest, url], { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`curl ${url} exit ${code}`)));
  });
}

function readHeader(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const firstLine = raw.split('\n')[0].trim();
  const cols = [];
  let i = 0, cur = '', inQ = false;
  while (i < firstLine.length) {
    const ch = firstLine[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
    else cur += ch;
    i++;
  }
  cols.push(cur);
  // de-dup via suffix
  const seen = new Map();
  return cols.map(c => {
    const base = normalize(c);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

async function loadOne(client, src) {
  const url = `${FJC_BASE}/${src.file}`;
  const dest = path.join(TMPDIR, src.file);
  process.stdout.write(`\n--- ${src.table} ---\n`);
  process.stdout.write(`  download ${url} ... `);
  await download(url, dest);
  const bytes = fs.statSync(dest).size;
  console.log(`${(bytes / 1e6).toFixed(2)} MB`);

  const cols = readHeader(dest);
  console.log(`  cols (${cols.length}): ${cols.slice(0, 5).join(', ')}${cols.length > 5 ? ', ...' : ''}`);

  await client.query(`DROP TABLE IF EXISTS ${src.table}`);
  const ddl = `CREATE TABLE ${src.table} (${cols.map(c => `"${c}" TEXT`).join(', ')})`;
  await client.query(ddl);

  const t0 = Date.now();
  const { rowCount } = await bulkCopyCsv(client, src.table, cols, dest);
  console.log(`  COPY ${rowCount.toLocaleString()} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const ix = `CREATE INDEX idx_${src.table}_nid ON ${src.table} ((nid::bigint))`;
  try { await client.query(ix); } catch (e) { console.log(`  (skipping nid index: ${e.message})`); }
}

const { client, cleanup } = await createBulkClient({
  workMemMB: 256, maintWorkMemMB: 512, statementTimeout: '30min',
});

try {
  console.log(`=== fjc-refresh ${new Date().toISOString()} ===`);
  for (const src of SOURCES) {
    try { await loadOne(client, src); }
    catch (e) { console.error(`FAIL ${src.table}: ${e.message}`); }
  }

  // Verify row counts
  console.log(`\n--- verify ---`);
  for (const src of SOURCES) {
    const r = await client.query(`SELECT count(*)::bigint AS c FROM ${src.table}`);
    console.log(`  ${src.table.padEnd(24)} ${Number(r.rows[0].c).toLocaleString()}`);
  }
} finally { await cleanup(); }
