#!/usr/bin/env node
/**
 * Build court_id → two-letter jurisdiction map from CL courts CSV.
 *
 * Uses the actual jurisdiction column (S=state, F=federal, etc.) plus
 * court_id patterns and full_name to derive the two-letter state code.
 *
 * Output: data/bulk-verify/cl-bulk/court-jurisdiction-map.json
 */
import { spawn } from 'child_process';
import { parse } from 'csv-parse';
import { writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stripQuotes } from './lib/csv-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const COURTS_BZ2 = path.join(PROJECT_ROOT, 'data', 'bulk-verify', 'cl-bulk', 'courts-2026-03-31.csv.bz2');
const OUTPUT = path.join(PROJECT_ROOT, 'data', 'bulk-verify', 'cl-bulk', 'court-jurisdiction-map.json');

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

// State name → code (for parsing full_name)
const STATE_MAP = {
  'alabama': 'al', 'alaska': 'ak', 'arizona': 'az', 'arkansas': 'ar',
  'california': 'ca', 'colorado': 'co', 'connecticut': 'ct', 'delaware': 'de',
  'florida': 'fl', 'georgia': 'ga', 'hawaii': 'hi', 'idaho': 'id',
  'illinois': 'il', 'indiana': 'in', 'iowa': 'ia', 'kansas': 'ks',
  'kentucky': 'ky', 'louisiana': 'la', 'maine': 'me', 'maryland': 'md',
  'massachusetts': 'ma', 'michigan': 'mi', 'minnesota': 'mn', 'mississippi': 'ms',
  'missouri': 'mo', 'montana': 'mt', 'nebraska': 'ne', 'nevada': 'nv',
  'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
  'north carolina': 'nc', 'north dakota': 'nd', 'ohio': 'oh', 'oklahoma': 'ok',
  'oregon': 'or', 'pennsylvania': 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
  'south dakota': 'sd', 'tennessee': 'tn', 'texas': 'tx', 'utah': 'ut',
  'vermont': 'vt', 'virginia': 'va', 'washington': 'wa', 'west virginia': 'wv',
  'wisconsin': 'wi', 'wyoming': 'wy', 'district of columbia': 'dc',
  'guam': 'gu', 'puerto rico': 'pr', 'virgin islands': 'vi',
  'northern mariana': 'mp', 'american samoa': 'as',
};

// CL court_id prefix → state code (common patterns)
const ID_PREFIX_MAP = {
  'ala': 'al', 'alaska': 'ak', 'ariz': 'az', 'ark': 'ar',
  'cal': 'ca', 'colo': 'co', 'conn': 'ct', 'del': 'de',
  'fla': 'fl', 'ga': 'ga', 'haw': 'hi', 'idaho': 'id',
  'ill': 'il', 'ind': 'in', 'iowa': 'ia', 'kan': 'ks',
  'ky': 'ky', 'la': 'la', 'me': 'me', 'md': 'md',
  'mass': 'ma', 'mich': 'mi', 'minn': 'mn', 'miss': 'ms',
  'mo': 'mo', 'mont': 'mt', 'neb': 'ne', 'nev': 'nv',
  'nh': 'nh', 'nj': 'nj', 'nm': 'nm', 'ny': 'ny',
  'nc': 'nc', 'nd': 'nd', 'ohio': 'oh', 'okla': 'ok',
  'or': 'or', 'pa': 'pa', 'ri': 'ri', 'sc': 'sc',
  'sd': 'sd', 'tenn': 'tn', 'tex': 'tx', 'utah': 'ut',
  'vt': 'vt', 'va': 'va', 'wash': 'wa', 'wva': 'wv',
  'wis': 'wi', 'wyo': 'wy', 'dc': 'dc',
  'guam': 'gu', 'pr': 'pr', 'vi': 'vi',
};

// Sort prefixes by length descending — longer/more-specific prefixes first
// to prevent 'mo' (Missouri) matching before 'mont' (Montana), etc.
const ID_PREFIX_SORTED = Object.entries(ID_PREFIX_MAP)
  .sort((a, b) => b[0].length - a[0].length);

// Federal court patterns in court_id
const FEDERAL_PATTERNS = [
  'ca1', 'ca2', 'ca3', 'ca4', 'ca5', 'ca6', 'ca7', 'ca8', 'ca9', 'ca10', 'ca11',
  'cadc', 'cafc', 'scotus', 'bap', 'uscfc', 'cit', 'ccpa',
  'armfor', 'tax', 'mc', 'mspb', 'ag', 'olc', 'fisc', 'fiscr',
];

function deriveJurisdiction(courtId, fullName, jurisdictionType) {
  const id = courtId.toLowerCase();
  const name = (fullName || '').toLowerCase();
  const jtype = stripQuotes(jurisdictionType || '').toUpperCase();

  // Federal jurisdiction types: F (federal appellate), FD (federal district), FB (federal bankruptcy), FBP (federal bankruptcy panel), FS (federal special)
  if (jtype === 'F' || jtype === 'FD' || jtype === 'FB' || jtype === 'FBP' || jtype === 'FS') {
    return 'federal';
  }

  // Check federal ID patterns
  for (const pat of FEDERAL_PATTERNS) {
    if (id === pat) return 'federal';
  }

  // Federal district courts (e.g., nyed, cacd, ilnd, txsd)
  // Pattern: 2-letter state + district indicator (d, ed, wd, nd, sd, md, cd)
  if (id.length >= 3) {
    const last2 = id.slice(-2);
    const last1 = id.slice(-1);
    if (last2 === 'ed' || last2 === 'wd' || last2 === 'nd' || last2 === 'sd' || last2 === 'md' || last2 === 'cd') {
      // Could be a federal district — check if name confirms
      if (name.indexOf('district') >= 0 || name.indexOf('bankruptcy') >= 0) {
        return 'federal';
      }
    }
    if (last1 === 'b' && (name.indexOf('bankruptcy') >= 0)) {
      return 'federal';
    }
  }

  // State jurisdiction types: S (state supreme), SA (state appellate), ST (state trial), SS (state special), SAG (state attorney general)
  if (jtype === 'S' || jtype === 'SA' || jtype === 'ST' || jtype === 'SS' || jtype === 'SAG') {
    // Try to derive state from court_id prefix
    for (const [prefix, code] of ID_PREFIX_SORTED) {
      if (id === prefix || id.indexOf(prefix) === 0) {
        return code;
      }
    }
    // Try to derive from full_name
    for (const [stateName, code] of Object.entries(STATE_MAP)) {
      if (name.indexOf(stateName) >= 0) {
        return code;
      }
    }
  }

  // Tribal: T
  if (jtype === 'T') return 'tribal';

  // Military: M
  if (jtype === 'M') return 'military';

  // Fallback: try ID prefix for any unmatched
  for (const [prefix, code] of ID_PREFIX_SORTED) {
    if (id === prefix || id.indexOf(prefix) === 0) {
      return code;
    }
  }

  // Fallback: try full_name
  for (const [stateName, code] of Object.entries(STATE_MAP)) {
    if (name.indexOf(stateName) >= 0) {
      return code;
    }
  }

  return 'unknown';
}

// ── Stream courts CSV ─────────────────────────────────────────────────────
console.log('=== Court Jurisdiction Map Builder ===');
console.log('Input: ' + COURTS_BZ2);

const bzcat = spawn(findBzcat(), [COURTS_BZ2], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

const csvParser = parse({
  columns: true,
  relax_quotes: true,
  relax_column_count: true,
  skip_empty_lines: true,
  cast: false,
});

bzcat.stderr.on('data', (d) => process.stderr.write(d));
bzcat.stdout.pipe(csvParser);

const courtMap = {};
let total = 0;
let mapped = 0;
let unmapped = 0;
const unmappedList = [];

try {
  for await (const record of csvParser) {
    total++;
    const courtId = stripQuotes(record.id || '');
    const fullName = stripQuotes(record.full_name || '');
    const jurisdictionType = stripQuotes(record.jurisdiction || '');

    if (!courtId) continue;

    const jurisdiction = deriveJurisdiction(courtId, fullName, jurisdictionType);
    courtMap[courtId] = jurisdiction;

    if (jurisdiction === 'unknown') {
      unmapped++;
      if (unmappedList.length < 30) unmappedList.push(courtId + ' (' + fullName + ') [type=' + jurisdictionType + ']');
    } else {
      mapped++;
    }
  }
} catch (err) {
  console.error('Error at row ' + total + ': ' + err.message);
}

console.log('\nTotal courts: ' + total);
console.log('Mapped: ' + mapped + ' (' + (total > 0 ? (mapped/total*100).toFixed(1) : '0.0') + '%)');
console.log('Unmapped: ' + unmapped);

// Distribution
const dist = {};
for (const j of Object.values(courtMap)) {
  dist[j] = (dist[j] || 0) + 1;
}
const sorted = Object.entries(dist).sort((a,b) => b[1] - a[1]);
console.log('\nJurisdiction distribution:');
for (const [code, count] of sorted) {
  console.log('  ' + code + ': ' + count);
}

if (unmappedList.length > 0) {
  console.log('\nSample unmapped courts:');
  for (const u of unmappedList) {
    console.log('  ' + u);
  }
}

console.log('\nWriting ' + OUTPUT + '...');
writeFileSync(OUTPUT, JSON.stringify(courtMap, null, 2));
console.log('Done.');
