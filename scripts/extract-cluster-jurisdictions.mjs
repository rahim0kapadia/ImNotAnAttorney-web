#!/usr/bin/env node
/**
 * Extract jurisdiction from CL opinion-clusters CSV using case_name_full.
 *
 * Streams the 2.4GB bz2 clusters file, extracts cluster_id + jurisdiction
 * from case_name_full and docket_id for later court lookup.
 *
 * Output: data/bulk-verify/cl-bulk/cluster-jurisdiction-map.json
 *   { "cluster_id": "XX", ... }  where XX = two-letter state code or "federal"
 *
 * Also outputs: data/bulk-verify/cl-bulk/cluster-docket-map.json
 *   { "cluster_id": "docket_id", ... }  for later court_id resolution
 */
import { spawn } from 'child_process';
import { parse } from 'csv-parse';
import { writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stripQuotes } from './lib/csv-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const CLUSTERS_BZ2 = path.join(PROJECT_ROOT, 'data', 'bulk-verify', 'cl-bulk', 'opinion-clusters-2026-03-31.csv.bz2');
const OUT_JURISDICTION = path.join(PROJECT_ROOT, 'data', 'bulk-verify', 'cl-bulk', 'cluster-jurisdiction-map.json');
const OUT_DOCKET = path.join(PROJECT_ROOT, 'data', 'bulk-verify', 'cl-bulk', 'cluster-docket-map.json');

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

// State patterns, same as bulk-classify but also catches "Commonwealth of X", "People of the State of X"
// Codes are lowercase to match pipeline convention
const STATE_PATTERNS = [
  ["florida", "fl"], ["california", "ca"], ["texas", "tx"], ["new york", "ny"],
  ["illinois", "il"], ["pennsylvania", "pa"], ["ohio", "oh"], ["georgia", "ga"],
  ["north carolina", "nc"], ["michigan", "mi"], ["new jersey", "nj"],
  ["virginia", "va"], ["washington", "wa"], ["arizona", "az"], ["massachusetts", "ma"],
  ["tennessee", "tn"], ["indiana", "in"], ["missouri", "mo"], ["maryland", "md"],
  ["wisconsin", "wi"], ["colorado", "co"], ["minnesota", "mn"], ["south carolina", "sc"],
  ["alabama", "al"], ["louisiana", "la"], ["kentucky", "ky"], ["oregon", "or"],
  ["oklahoma", "ok"], ["connecticut", "ct"], ["utah", "ut"], ["iowa", "ia"],
  ["nevada", "nv"], ["arkansas", "ar"], ["mississippi", "ms"], ["kansas", "ks"],
  ["new mexico", "nm"], ["nebraska", "ne"], ["idaho", "id"], ["west virginia", "wv"],
  ["hawaii", "hi"], ["new hampshire", "nh"], ["maine", "me"], ["montana", "mt"],
  ["rhode island", "ri"], ["delaware", "de"], ["south dakota", "sd"],
  ["north dakota", "nd"], ["alaska", "ak"], ["vermont", "vt"], ["wyoming", "wy"],
  ["district of columbia", "dc"],
];

// Federal indicators in case_name_full.
// "district court" removed, too broad, matches state district courts.
// Use "united states district" instead.
const FEDERAL_PATTERNS = [
  "united states of america",
  "united states v.",
  "u.s. v.",
  "circuit court of appeals",
  "court of appeals for the",
  "united states district",
  "bankruptcy court",
  "court of federal claims",
  "court of international trade",
  "supreme court of the united states",
];

function deriveJurisdictionFromCaseName(caseName, caseNameFull) {
  if (!caseNameFull && !caseName) return null;
  const text = (caseNameFull || caseName || '').toLowerCase();

  // Check federal patterns first
  for (const pat of FEDERAL_PATTERNS) {
    if (text.indexOf(pat) >= 0) return "federal";
  }

  // Check state patterns, "State of X", "Commonwealth of X", "People of the State of X"
  for (const [name, code] of STATE_PATTERNS) {
    if (text.indexOf(name) >= 0) return code;
  }

  return null;
}

// ── Stream clusters CSV ─────────────────────────────────────────────────────
console.log('=== Cluster Jurisdiction Extractor ===');
console.log('Input: ' + CLUSTERS_BZ2);

const bzcat = spawn(findBzcat(), [CLUSTERS_BZ2], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
bzcat.stderr.on('data', (d) => process.stderr.write(d));

const parser = parse({
  columns: true,
  relax_quotes: true,
  relax_column_count: true,
  skip_empty_lines: true,
  cast: false,
});

bzcat.stdout.pipe(parser);

const jurisdictionMap = {};
const docketMap = {};
let total = 0;
let mapped = 0;
let federal = 0;
let unknown = 0;
const stateCounts = {};
const start = Date.now();

try {
  for await (const record of parser) {
    total++;

    const clusterId = stripQuotes(record.id || '');
    const caseName = stripQuotes(record.case_name || '');
    const caseNameFull = stripQuotes(record.case_name_full || '');
    const docketId = stripQuotes(record.docket_id || '');

    if (!clusterId) continue;

    // Store docket_id for later court resolution
    if (docketId) docketMap[clusterId] = docketId;

    // Derive jurisdiction
    const jurisdiction = deriveJurisdictionFromCaseName(caseName, caseNameFull);

    if (jurisdiction) {
      jurisdictionMap[clusterId] = jurisdiction;
      mapped++;
      if (jurisdiction === 'federal') federal++;
      else {
        stateCounts[jurisdiction] = (stateCounts[jurisdiction] || 0) + 1;
      }
    } else {
      unknown++;
    }

    // Progress every 500K
    if (total % 500000 === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(0);
      const rate = (total / ((Date.now() - start) / 1000)).toFixed(0);
      const mappedPct = total > 0 ? (mapped/total*100).toFixed(1) : '0.0';
      console.log('  ' + (total/1e6).toFixed(1) + 'M clusters | ' + mapped.toLocaleString() + ' mapped (' + mappedPct + '%) | ' + federal.toLocaleString() + ' federal | ' + elapsed + 's | ' + rate + '/sec');
    }
  }
} catch (err) {
  console.error('Stream error at row ' + total + ': ' + err.message);
  console.log('Saving partial results...');
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
const mappedPct = total > 0 ? (mapped/total*100).toFixed(1) : '0.0';
console.log('\n=== Complete ===');
console.log('Total clusters: ' + total.toLocaleString());
console.log('Mapped: ' + mapped.toLocaleString() + ' (' + mappedPct + '%)');
console.log('Federal: ' + federal.toLocaleString());
console.log('Unknown: ' + unknown.toLocaleString());
console.log('Elapsed: ' + elapsed + 's');

// Top states
const sorted = Object.entries(stateCounts).sort((a,b) => b[1] - a[1]);
console.log('\nTop 15 states:');
for (const [code, count] of sorted.slice(0, 15)) {
  console.log('  ' + code + ': ' + count.toLocaleString());
}

// Write outputs
console.log('\nWriting ' + OUT_JURISDICTION + ' (' + Object.keys(jurisdictionMap).length.toLocaleString() + ' entries)...');
writeFileSync(OUT_JURISDICTION, JSON.stringify(jurisdictionMap));
console.log('Writing ' + OUT_DOCKET + ' (' + Object.keys(docketMap).length.toLocaleString() + ' entries)...');
writeFileSync(OUT_DOCKET, JSON.stringify(docketMap));
console.log('Done.');
