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
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
  'guam': 'GU', 'puerto rico': 'PR', 'virgin islands': 'VI',
  'northern mariana': 'MP', 'american samoa': 'AS',
};

// CL court_id prefix → state code (common patterns)
const ID_PREFIX_MAP = {
  'ala': 'AL', 'alaska': 'AK', 'ariz': 'AZ', 'ark': 'AR',
  'cal': 'CA', 'colo': 'CO', 'conn': 'CT', 'del': 'DE',
  'fla': 'FL', 'ga': 'GA', 'haw': 'HI', 'idaho': 'ID',
  'ill': 'IL', 'ind': 'IN', 'iowa': 'IA', 'kan': 'KS',
  'ky': 'KY', 'la': 'LA', 'me': 'ME', 'md': 'MD',
  'mass': 'MA', 'mich': 'MI', 'minn': 'MN', 'miss': 'MS',
  'mo': 'MO', 'mont': 'MT', 'neb': 'NE', 'nev': 'NV',
  'nh': 'NH', 'nj': 'NJ', 'nm': 'NM', 'ny': 'NY',
  'nc': 'NC', 'nd': 'ND', 'ohio': 'OH', 'okla': 'OK',
  'or': 'OR', 'pa': 'PA', 'ri': 'RI', 'sc': 'SC',
  'sd': 'SD', 'tenn': 'TN', 'tex': 'TX', 'utah': 'UT',
  'vt': 'VT', 'va': 'VA', 'wash': 'WA', 'wva': 'WV',
  'wis': 'WI', 'wyo': 'WY', 'dc': 'DC',
  'guam': 'GU', 'pr': 'PR', 'vi': 'VI',
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

function stripQuotes(val) {
  if (!val) return '';
  if (val.charAt(0) === '"') val = val.slice(1);
  if (val.charAt(val.length - 1) === '"') val = val.slice(0, -1);
  return val;
}

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
