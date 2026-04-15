#!/usr/bin/env node
/**
 * Extract (docket_id, court_id) from CL dockets bulk CSV.
 *
 * Streams the 5GB bz2, extracts only id + court_id columns,
 * builds a docket_id → court_id mapping.
 *
 * Then combines with:
 *   - cluster-docket-map.json (cluster_id → docket_id, from extract-cluster-jurisdictions.mjs)
 *   - court-jurisdiction-map.json (court_id → jurisdiction, from parse-cl-courts.mjs)
 *
 * Final output: cluster-jurisdiction-map-v2.json
 *   Complete cluster_id → jurisdiction mapping via: cluster → docket → court → jurisdiction
 *
 * NOTE: build-final-jurisdiction-map.mjs is the authoritative merger that produces
 * cluster-jurisdiction-map.json. This script's --merge mode produces the alternative
 * cluster-jurisdiction-map-v2.json. Both files are kept; neither replaces the other.
 *
 * Usage:
 *   node scripts/extract-docket-courts.mjs          # Build docket→court map only
 *   node scripts/extract-docket-courts.mjs --merge   # Also merge into cluster jurisdiction map
 */
import { spawn } from 'child_process';
import { parse } from 'csv-parse';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const DOCKETS_BZ2 = path.join(PROJECT_ROOT, 'data', 'bulk-verify', 'cl-bulk', 'dockets-2026-03-31.csv.bz2');
const DOCKET_COURT_MAP = path.join(PROJECT_ROOT, 'data', 'bulk-verify', 'cl-bulk', 'docket-court-map.json');
const CLUSTER_DOCKET_MAP = path.join(PROJECT_ROOT, 'data', 'bulk-verify', 'cl-bulk', 'cluster-docket-map.json');
const COURT_JURISDICTION_MAP = path.join(PROJECT_ROOT, 'data', 'bulk-verify', 'cl-bulk', 'court-jurisdiction-map.json');
const OUTPUT = path.join(PROJECT_ROOT, 'data', 'bulk-verify', 'cl-bulk', 'cluster-jurisdiction-map-v2.json');
const doMerge = process.argv.includes('--merge');

function findBzcat() {
  const candidates = [
    'C:\\Program Files\\Git\\usr\\bin\\bzcat.exe',
    'C:\\Program Files\\Git\\mingw64\\bin\\bzcat.exe',
    'bzcat',
  ];
  for (const p of candidates) {
    if (p === 'bzcat') return p;
    try { if (existsSync(p)) return p; } catch {}
  }
  return 'bzcat';
}

// Strip CL CSV surrounding quotes without regex (project rule)
function stripQuotes(val) {
  if (!val) return '';
  if (val.charAt(0) === '"') val = val.slice(1);
  if (val.charAt(val.length - 1) === '"') val = val.slice(0, -1);
  return val;
}

// ── Phase 1: Stream dockets CSV → docket_id → court_id ─────────────────────
console.log('=== Docket Court Extractor ===');
console.log('Input: ' + DOCKETS_BZ2);

if (!existsSync(DOCKETS_BZ2)) {
  console.error('Dockets file not found. Download it first.');
  process.exit(1);
}

const bzcat = spawn(findBzcat(), [DOCKETS_BZ2], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
bzcat.stderr.on('data', d => {
  const msg = d.toString().slice(0, 200);
  if (msg.toLowerCase().indexOf('error') >= 0) console.error('bzcat stderr:', msg);
});

const csvParser = parse({
  columns: true,
  relax_quotes: true,
  relax_column_count: true,
  skip_empty_lines: true,
  cast: false,
});

bzcat.stdout.pipe(csvParser);

const docketCourt = new Map();
let total = 0;
let mapped = 0;
const start = Date.now();
let headerLogged = false;

try {
  for await (const record of csvParser) {
    total++;

    // Log header columns on first row
    if (!headerLogged) {
      console.log('Columns: ' + Object.keys(record).join(', '));
      headerLogged = true;
    }

    const docketId = stripQuotes(record.id || '');
    // CL dockets table: court_id is the court identifier
    const courtId = stripQuotes(record.court_id || record.court || '');

    if (docketId && courtId) {
      docketCourt.set(docketId, courtId);
      mapped++;
    }

    if (total % 1000000 === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      const rate = (total / ((Date.now() - start) / 1000)).toFixed(0);
      console.log('  ' + (total/1e6).toFixed(0) + 'M dockets | ' + mapped.toLocaleString() + ' with court | ' + elapsed + 's | ' + rate + '/sec');
    }
  }
} catch (err) {
  console.error('Stream error at row ' + total + ': ' + err.message);
  console.log('Saving partial results...');
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const mappedPct = total > 0 ? (mapped/total*100).toFixed(1) : '0.0';
console.log('\n=== Phase 1 Complete ===');
console.log('Total dockets: ' + total.toLocaleString());
console.log('With court: ' + mapped.toLocaleString() + ' (' + mappedPct + '%)');
console.log('Elapsed: ' + elapsed + 's');

console.log('\nWriting ' + DOCKET_COURT_MAP + '...');
writeFileSync(DOCKET_COURT_MAP, JSON.stringify(Object.fromEntries(docketCourt)));
console.log('  ' + docketCourt.size.toLocaleString() + ' entries');

// ── Phase 2 (--merge): Combine all maps → cluster_id → jurisdiction ─────────
if (!doMerge) {
  console.log('\nSkipping merge. Re-run with --merge to build final jurisdiction map.');
  process.exit(0);
}

console.log('\n=== Phase 2: Merge Maps ===');

if (!existsSync(CLUSTER_DOCKET_MAP)) {
  console.error('Missing ' + CLUSTER_DOCKET_MAP + '. Run extract-cluster-jurisdictions.mjs first.');
  process.exit(1);
}
if (!existsSync(COURT_JURISDICTION_MAP)) {
  console.error('Missing ' + COURT_JURISDICTION_MAP + '. Run parse-cl-courts.mjs first.');
  process.exit(1);
}

const clusterDocket = JSON.parse(readFileSync(CLUSTER_DOCKET_MAP, 'utf8'));
const courtJurisdiction = JSON.parse(readFileSync(COURT_JURISDICTION_MAP, 'utf8'));

console.log('  Cluster->Docket entries: ' + Object.keys(clusterDocket).length.toLocaleString());
console.log('  Court->Jurisdiction entries: ' + Object.keys(courtJurisdiction).length.toLocaleString());
console.log('  Docket->Court entries: ' + docketCourt.size.toLocaleString());

const finalMap = {};
let resolved = 0;
let missingDocket = 0;
let missingJurisdiction = 0;

for (const [clusterId, docketId] of Object.entries(clusterDocket)) {
  const courtId = docketCourt.get(docketId);
  if (!courtId) { missingDocket++; continue; }

  const jurisdiction = courtJurisdiction[courtId];
  if (!jurisdiction) { missingJurisdiction++; continue; }

  finalMap[clusterId] = jurisdiction;
  resolved++;
}

console.log('\n=== Merge Results ===');
console.log('Resolved: ' + resolved.toLocaleString() + ' clusters -> jurisdiction');
console.log('Missing docket->court: ' + missingDocket.toLocaleString());
console.log('Missing court->jurisdiction: ' + missingJurisdiction.toLocaleString());

// Distribution
const dist = {};
for (const j of Object.values(finalMap)) {
  dist[j] = (dist[j] || 0) + 1;
}
const sorted = Object.entries(dist).sort((a,b) => b[1] - a[1]);
console.log('\nTop 15 jurisdictions:');
for (const [code, count] of sorted.slice(0, 15)) {
  console.log('  ' + code + ': ' + count.toLocaleString());
}

console.log('\nWriting ' + OUTPUT + ' (' + Object.keys(finalMap).length.toLocaleString() + ' entries)...');
writeFileSync(OUTPUT, JSON.stringify(finalMap));
console.log('Done.');
