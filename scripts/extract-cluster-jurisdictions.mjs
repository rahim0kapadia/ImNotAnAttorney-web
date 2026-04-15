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
import { writeFileSync } from 'fs';

const CLUSTERS_BZ2 = 'data/bulk-verify/cl-bulk/opinion-clusters-2026-03-31.csv.bz2';
const OUT_JURISDICTION = 'data/bulk-verify/cl-bulk/cluster-jurisdiction-map.json';
const OUT_DOCKET = 'data/bulk-verify/cl-bulk/cluster-docket-map.json';

// State patterns — same as bulk-classify but also catches "Commonwealth of X", "People of the State of X"
const STATE_PATTERNS = [
  ["florida", "FL"], ["california", "CA"], ["texas", "TX"], ["new york", "NY"],
  ["illinois", "IL"], ["pennsylvania", "PA"], ["ohio", "OH"], ["georgia", "GA"],
  ["north carolina", "NC"], ["michigan", "MI"], ["new jersey", "NJ"],
  ["virginia", "VA"], ["washington", "WA"], ["arizona", "AZ"], ["massachusetts", "MA"],
  ["tennessee", "TN"], ["indiana", "IN"], ["missouri", "MO"], ["maryland", "MD"],
  ["wisconsin", "WI"], ["colorado", "CO"], ["minnesota", "MN"], ["south carolina", "SC"],
  ["alabama", "AL"], ["louisiana", "LA"], ["kentucky", "KY"], ["oregon", "OR"],
  ["oklahoma", "OK"], ["connecticut", "CT"], ["utah", "UT"], ["iowa", "IA"],
  ["nevada", "NV"], ["arkansas", "AR"], ["mississippi", "MS"], ["kansas", "KS"],
  ["new mexico", "NM"], ["nebraska", "NE"], ["idaho", "ID"], ["west virginia", "WV"],
  ["hawaii", "HI"], ["new hampshire", "NH"], ["maine", "ME"], ["montana", "MT"],
  ["rhode island", "RI"], ["delaware", "DE"], ["south dakota", "SD"],
  ["north dakota", "ND"], ["alaska", "AK"], ["vermont", "VT"], ["wyoming", "WY"],
  ["district of columbia", "DC"],
];

// Federal indicators in case_name_full
const FEDERAL_PATTERNS = [
  "united states of america",
  "united states v.",
  "u.s. v.",
  "circuit court of appeals",
  "court of appeals for the",
  "district court",
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

  // Check state patterns — "State of X", "Commonwealth of X", "People of the State of X"
  for (const [name, code] of STATE_PATTERNS) {
    if (text.indexOf(name) >= 0) return code;
  }

  return null;
}

// ── Stream clusters CSV ─────────────────────────────────────────────────────
console.log('=== Cluster Jurisdiction Extractor ===');
console.log(`Input: ${CLUSTERS_BZ2}`);

const bzcat = spawn('C:\\Program Files\\Git\\usr\\bin\\bzcat.exe', [CLUSTERS_BZ2], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

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

    let clusterId = record.id || '';
    if (clusterId.charAt(0) === '"') clusterId = clusterId.slice(1);
    if (clusterId.charAt(clusterId.length - 1) === '"') clusterId = clusterId.slice(0, -1);
    let caseName = record.case_name || '';
    if (caseName.charAt(0) === '"') caseName = caseName.slice(1);
    if (caseName.charAt(caseName.length - 1) === '"') caseName = caseName.slice(0, -1);
    let caseNameFull = record.case_name_full || '';
    if (caseNameFull.charAt(0) === '"') caseNameFull = caseNameFull.slice(1);
    if (caseNameFull.charAt(caseNameFull.length - 1) === '"') caseNameFull = caseNameFull.slice(0, -1);
    let docketId = record.docket_id || '';
    if (docketId.charAt(0) === '"') docketId = docketId.slice(1);
    if (docketId.charAt(docketId.length - 1) === '"') docketId = docketId.slice(0, -1);

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
      console.log(`  ${(total/1e6).toFixed(1)}M clusters | ${mapped.toLocaleString()} mapped (${(mapped/total*100).toFixed(1)}%) | ${federal.toLocaleString()} federal | ${elapsed}s | ${rate}/sec`);
    }
  }
} catch (err) {
  console.error(`Stream error at row ${total}: ${err.message}`);
  console.log('Saving partial results...');
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n=== Complete ===`);
console.log(`Total clusters: ${total.toLocaleString()}`);
console.log(`Mapped: ${mapped.toLocaleString()} (${(mapped/total*100).toFixed(1)}%)`);
console.log(`Federal: ${federal.toLocaleString()}`);
console.log(`Unknown: ${unknown.toLocaleString()}`);
console.log(`Elapsed: ${elapsed}s`);

// Top states
const sorted = Object.entries(stateCounts).sort((a,b) => b[1] - a[1]);
console.log('\nTop 15 states:');
for (const [code, count] of sorted.slice(0, 15)) {
  console.log(`  ${code}: ${count.toLocaleString()}`);
}

// Write outputs
console.log(`\nWriting ${OUT_JURISDICTION} (${Object.keys(jurisdictionMap).length.toLocaleString()} entries)...`);
writeFileSync(OUT_JURISDICTION, JSON.stringify(jurisdictionMap));
console.log(`Writing ${OUT_DOCKET} (${Object.keys(docketMap).length.toLocaleString()} entries)...`);
writeFileSync(OUT_DOCKET, JSON.stringify(docketMap));
console.log('Done.');
