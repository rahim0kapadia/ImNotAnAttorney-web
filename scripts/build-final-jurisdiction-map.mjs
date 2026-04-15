#!/usr/bin/env node
/**
 * Build final cluster_id → jurisdiction map by streaming dockets CSV
 * and only keeping entries that match our cluster-docket-map.
 *
 * Pipeline: cluster_id → (cluster-docket-map) → docket_id → (dockets CSV) → court_id → (court-jurisdiction-map) → jurisdiction
 *
 * Memory-efficient: only stores docket_ids we care about (~unique count from clusters).
 *
 * Output: data/bulk-verify/cl-bulk/cluster-jurisdiction-map.json (overwrites v1)
 */
import { spawn } from 'child_process';
import { parse } from 'csv-parse';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const DOCKETS_BZ2 = 'data/bulk-verify/cl-bulk/dockets-2026-03-31.csv.bz2';
const CLUSTER_DOCKET_MAP = 'data/bulk-verify/cl-bulk/cluster-docket-map.json';
const COURT_JURISDICTION_MAP = 'data/bulk-verify/cl-bulk/court-jurisdiction-map.json';
const OUTPUT = 'data/bulk-verify/cl-bulk/cluster-jurisdiction-map.json';

function stripQuotes(val) {
  if (!val) return '';
  if (val.charAt(0) === '"') val = val.slice(1);
  if (val.charAt(val.length - 1) === '"') val = val.slice(0, -1);
  return val;
}

// ── Phase 1: Load reference maps ──────────────────────────────────────────
console.log('=== Final Jurisdiction Map Builder ===');

if (!existsSync(CLUSTER_DOCKET_MAP)) {
  console.error('Missing ' + CLUSTER_DOCKET_MAP + '. Run extract-cluster-jurisdictions.mjs first.');
  process.exit(1);
}
if (!existsSync(COURT_JURISDICTION_MAP)) {
  console.error('Missing ' + COURT_JURISDICTION_MAP + '. Run build-court-jurisdiction-map.mjs first.');
  process.exit(1);
}
if (!existsSync(DOCKETS_BZ2)) {
  console.error('Missing ' + DOCKETS_BZ2 + '. Download from CL bulk data first.');
  process.exit(1);
}

console.log('Loading cluster-docket-map.json...');
const clusterDocket = JSON.parse(readFileSync(CLUSTER_DOCKET_MAP, 'utf8'));
const clusterCount = Object.keys(clusterDocket).length;
console.log('  ' + clusterCount.toLocaleString() + ' clusters');

// Build set of unique docket_ids we need
const neededDockets = new Set();
for (const docketId of Object.values(clusterDocket)) {
  neededDockets.add(docketId);
}
console.log('  ' + neededDockets.size.toLocaleString() + ' unique docket_ids to resolve');

console.log('Loading court-jurisdiction-map.json...');
const courtJurisdiction = JSON.parse(readFileSync(COURT_JURISDICTION_MAP, 'utf8'));
console.log('  ' + Object.keys(courtJurisdiction).length.toLocaleString() + ' courts');

// ── Phase 2: Stream dockets CSV, only keep matching entries ──────────────
console.log('\nStreaming ' + DOCKETS_BZ2 + '...');
console.log('Only keeping docket_ids that match our clusters (' + neededDockets.size.toLocaleString() + ' needed)');

const bzcat = spawn('C:\\Program Files\\Git\\usr\\bin\\bzcat.exe', [DOCKETS_BZ2], {
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

// docket_id → court_id (only for dockets we need)
const docketCourt = new Map();
let total = 0;
let matched = 0;
const start = Date.now();

try {
  for await (const record of csvParser) {
    total++;

    const docketId = stripQuotes(record.id || '');

    // Skip dockets we don't need
    if (!neededDockets.has(docketId)) {
      if (total % 5000000 === 0) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        const rate = (total / ((Date.now() - start) / 1000)).toFixed(0);
        const pct = (matched / neededDockets.size * 100).toFixed(1);
        console.log('  ' + (total/1e6).toFixed(0) + 'M scanned | ' + matched.toLocaleString() + '/' + neededDockets.size.toLocaleString() + ' matched (' + pct + '%) | ' + elapsed + 's | ' + rate + '/sec');
      }
      continue;
    }

    const courtId = stripQuotes(record.court_id || '');
    if (courtId) {
      docketCourt.set(docketId, courtId);
      matched++;
    }

    // Progress
    if (matched % 100000 === 0 && matched > 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      const pct = (matched / neededDockets.size * 100).toFixed(1);
      console.log('  ' + matched.toLocaleString() + '/' + neededDockets.size.toLocaleString() + ' dockets resolved (' + pct + '%) | ' + (total/1e6).toFixed(1) + 'M scanned | ' + elapsed + 's');
    }

    // Early exit if all needed dockets found
    if (matched >= neededDockets.size) {
      console.log('  All needed dockets found! Stopping early at row ' + total.toLocaleString());
      try { bzcat.kill(); } catch {}
      break;
    }
  }
} catch (err) {
  console.error('Stream error at row ' + total + ': ' + err.message);
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log('\n=== Phase 2 Complete ===');
console.log('Scanned: ' + total.toLocaleString() + ' dockets');
console.log('Matched: ' + matched.toLocaleString() + ' / ' + neededDockets.size.toLocaleString() + ' needed');
console.log('Elapsed: ' + elapsed + 's');

// ── Phase 3: Build final cluster → jurisdiction map ─────────────────────
console.log('\n=== Phase 3: Build Final Map ===');

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

console.log('Resolved: ' + resolved.toLocaleString() + ' clusters → jurisdiction');
console.log('Missing docket→court: ' + missingDocket.toLocaleString());
console.log('Missing court→jurisdiction: ' + missingJurisdiction.toLocaleString());

// Distribution
const dist = {};
for (const j of Object.values(finalMap)) {
  dist[j] = (dist[j] || 0) + 1;
}
const sorted = Object.entries(dist).sort((a,b) => b[1] - a[1]);
console.log('\nTop 20 jurisdictions:');
for (const [code, count] of sorted.slice(0, 20)) {
  console.log('  ' + code + ': ' + count.toLocaleString());
}

console.log('\nWriting ' + OUTPUT + ' (' + Object.keys(finalMap).length.toLocaleString() + ' entries)...');
writeFileSync(OUTPUT, JSON.stringify(finalMap));
console.log('Done. Classifier will pick this up on next run.');
