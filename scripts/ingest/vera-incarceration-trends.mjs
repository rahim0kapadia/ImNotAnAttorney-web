// Template: scripts/ingest/fjc-refresh.mjs
// Expert: lukas-fittl
// Pattern: cl-bulk-data-defensive #18 + #19
// csv-bulk-checked: https://github.com/vera-institute/incarceration-trends/raw/master/incarceration_trends.csv
//
// A3 — Vera Incarceration Trends (county + state 1970-2026).
// Unlocks "your county's incarceration rate vs state avg" baseline realism
// for Intelligence Brief + Case Decoder. CC-BY license per repo.
//
// Data shape: county-year rows with jail/prison populations by race+crime type.

import { createBulkClient, bulkCopyCsv } from '../lib/pg-bulk-defaults.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const TMPDIR = path.join(os.tmpdir(), 'vera-trends');
const BASE = 'https://raw.githubusercontent.com/vera-institute/incarceration-trends/master';
const SOURCES = [
  { table: 'vera_incarceration_county', file: 'incarceration_trends_county.csv' },
  { table: 'vera_incarceration_state', file: 'incarceration_trends_state.csv' },
  { table: 'vera_jail_construction',    file: 'incarceration_trends_jail_construction.csv' },
  { table: 'vera_regional_jails',        file: 'regional_jails_county.csv' },
];

function normalize(col, idx) {
  const n = col.replace(/^"|"$/g, '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'c_$1');
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
  const seen = new Map();
  return cols.map((c, idx) => {
    const base = normalize(c, idx);
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

async function loadOne(client, src) {
  const url = `${BASE}/${src.file}`;
  const dest = path.join(TMPDIR, src.file);
  process.stdout.write(`\n--- ${src.table} ---\n  download ${url} ... `);
  try { await download(url, dest); }
  catch (e) { console.log(`FAIL: ${e.message}`); return; }
  console.log(`${(fs.statSync(dest).size / 1e6).toFixed(2)} MB`);
  const cols = readHeader(dest);
  console.log(`  cols=${cols.length}`);
  await client.query(`DROP TABLE IF EXISTS ${src.table}`);
  await client.query(`CREATE TABLE ${src.table} (${cols.map(c => `"${c}" TEXT`).join(', ')})`);
  const t0 = Date.now();
  const { rowCount } = await bulkCopyCsv(client, src.table, cols, dest);
  console.log(`  COPY ${rowCount.toLocaleString()} rows in ${((Date.now()-t0)/1000).toFixed(1)}s`);
}

const { client, cleanup } = await createBulkClient({ workMemMB: 256, maintWorkMemMB: 256, statementTimeout: '30min' });
try {
  console.log(`=== A3 vera-incarceration-trends ${new Date().toISOString()} ===`);
  for (const s of SOURCES) {
    try { await loadOne(client, s); } catch (e) { console.error(`FAIL ${s.table}: ${e.message}`); }
  }
  console.log(`\n--- verify ---`);
  for (const s of SOURCES) {
    try {
      const r = await client.query(`SELECT count(*)::bigint AS c FROM ${s.table}`);
      console.log(`  ${s.table.padEnd(30)} ${Number(r.rows[0].c).toLocaleString()}`);
    } catch (e) { console.log(`  ${s.table}: ${e.message}`); }
  }
} finally { await cleanup(); }
