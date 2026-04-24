// Template: scripts/score-observations-index.mjs (first in class)
// Expert: ~/.claude/experts/margaret-hagan.md (Legal Design Lab — A2J UPL/content audit methodology)
// Pattern: worry-to-pristine Phase 5 Task C0
// csv-bulk-checked: none-exists — reads .ts source file, not CSV data; writes JSON index

/**
 * score-observations-index.mjs
 *
 * Scans src/lib/score.ts and emits docs/audits/2026-04-24-score-observations-line-index.json.
 * Every observation-string return site is indexed with charge-branch, attorney-state,
 * and time-window context derived from surrounding code (20-line lookback).
 *
 * Idempotent: re-running regenerates the JSON from scratch.
 *
 * Usage: node scripts/score-observations-index.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SOURCE_FILE = resolve(REPO_ROOT, 'src/lib/score.ts');
const OUT_DIR = resolve(REPO_ROOT, 'docs/audits');
const OUT_FILE = resolve(OUT_DIR, '2026-04-24-score-observations-line-index.json');

// ---------------------------------------------------------------------------
// Read source
// ---------------------------------------------------------------------------
const src = readFileSync(SOURCE_FILE, 'utf8');
const lines = src.split('\n');

// ---------------------------------------------------------------------------
// Build offset → 1-indexed line number map
// ---------------------------------------------------------------------------
const lineStartOffsets = [0];
for (let i = 0; i < src.length; i++) {
  if (src[i] === '\n') lineStartOffsets.push(i + 1);
}
function offsetToLine(offset) {
  let lo = 0, hi = lineStartOffsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStartOffsets[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1; // 1-indexed
}

// ---------------------------------------------------------------------------
// Parse a quoted string literal starting at offset i.
// Handles ", ', ` with basic escape support.
// Returns { text, end } or null.
// ---------------------------------------------------------------------------
function readStringLiteral(s, i) {
  const delim = s[i];
  if (delim !== '"' && delim !== "'" && delim !== '`') return null;
  let text = '';
  let j = i + 1;
  while (j < s.length) {
    const ch = s[j];
    if (ch === '\\' && delim !== '`') {
      j++;
      const esc = s[j] ?? '';
      if (esc === 'n') text += '\n';
      else if (esc === 't') text += '\t';
      else text += esc;
      j++;
    } else if (ch === delim) {
      return { text, end: j + 1 };
    } else {
      text += ch;
      j++;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extract all observation strings with their source offsets.
//
// Two-pass approach:
//   Pass A — scan calculateScore for observations.push("...") calls
//   Pass B — scan getChargeSpecificObservation body line by line, attributing
//             each string to the case label it lives under
// ---------------------------------------------------------------------------

/**
 * Pass A: extract observations.push("...") calls from anywhere in the file.
 */
function extractPushObservations() {
  const results = [];
  const seenOffsets = new Set();
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('observations.push(', i)) {
      let j = i + 'observations.push('.length;
      while (j < src.length && ' \n\r'.includes(src[j])) j++;
      const res = readStringLiteral(src, j);
      if (res && !seenOffsets.has(j)) {
        seenOffsets.add(j);
        results.push({ lineNo: offsetToLine(j), text: res.text, source: 'push' });
        i = res.end;
        continue;
      }
    }
    i++;
  }
  return results;
}

/**
 * Pass B: walk getChargeSpecificObservation line by line.
 * Track current case label; collect every return/"ternary string" in that case.
 * Returns array of { lineNo, text, chargeBranch }.
 */
function extractChargeSpecificObservations() {
  // Find function start
  const fnMarker = 'export function getChargeSpecificObservation(';
  const fnStart = src.indexOf(fnMarker);
  if (fnStart === -1) return [];

  // Find the opening brace of the function body
  let bodyStart = src.indexOf('{', fnStart);
  if (bodyStart === -1) return [];

  // Walk to the matching closing brace to find function end
  let depth = 1;
  let pos = bodyStart + 1;
  while (pos < src.length && depth > 0) {
    if (src[pos] === '{') depth++;
    else if (src[pos] === '}') depth--;
    pos++;
  }
  const fnEnd = pos; // exclusive

  const fnBody = src.slice(bodyStart, fnEnd);
  const fnBodyLines = fnBody.split('\n');
  const fnStartLine = offsetToLine(bodyStart); // 1-indexed line of opening brace

  const results = [];
  let currentCharge = 'cross-cutting'; // before any case label

  // Regex for case "slug": lines
  const caseRe = /^\s*case\s+["'`]([^"'`]+)["'`]\s*:/;
  // Regex for default: line
  const defaultRe = /^\s*default\s*:/;

  const seenOffsets = new Set();

  for (let li = 0; li < fnBodyLines.length; li++) {
    const lineText = fnBodyLines[li];
    const absoluteLine = fnStartLine + li;

    // Detect case label
    const caseMatch = lineText.match(caseRe);
    if (caseMatch) {
      const slug = caseMatch[1];
      currentCharge = slug === 'drug' ? 'drug-possession' : slug;
      continue;
    }
    if (defaultRe.test(lineText)) {
      currentCharge = 'cross-cutting';
      continue;
    }

    // Scan for string literals on this line (return, ternary ?, ternary :)
    // Compute character offset of this line in src
    const lineOffset = lineStartOffsets[absoluteLine - 1] ?? 0;

    let col = 0;
    while (col < lineText.length) {
      const ch = lineText[col];

      // Skip line comments
      if (lineText.slice(col).startsWith('//')) break;

      // Look for a string-producing token: return, ?, :
      // We identify the start of a string literal as " ' `
      if (ch === '"' || ch === "'" || ch === '`') {
        // Make sure this isn't inside a regex or comment — simple heuristic:
        // only capture if this col position isn't preceded by = (assignment, not return value)
        const pre = lineText.slice(0, col).trimEnd();
        const isReturnStr = pre.endsWith('return') || pre.endsWith('?') || pre.endsWith(':');
        if (isReturnStr) {
          const globalOffset = lineOffset + col;
          if (!seenOffsets.has(globalOffset)) {
            const res = readStringLiteral(src, globalOffset);
            if (res) {
              seenOffsets.add(globalOffset);
              results.push({
                lineNo: absoluteLine,
                text: res.text,
                chargeBranch: currentCharge,
              });
              // Advance col past the string
              col += res.end - globalOffset;
              continue;
            }
          }
        }
      }
      col++;
    }
  }

  return results;
}

function extractObservationStrings() {
  const pushObs = extractPushObservations();
  const chargeObs = extractChargeSpecificObservations();

  // Merge; charge-specific observations override push observations at same line
  // (there should be no overlap, but guard anyway)
  const byLine = new Map();
  for (const o of pushObs) {
    byLine.set(o.lineNo, { lineNo: o.lineNo, text: o.text, chargeBranch: null });
  }
  for (const o of chargeObs) {
    byLine.set(o.lineNo, { lineNo: o.lineNo, text: o.text, chargeBranch: o.chargeBranch });
  }
  return [...byLine.values()];
}

// ---------------------------------------------------------------------------
// Context analysis helpers — 20-line lookback
// ---------------------------------------------------------------------------

// Order matters: longer/more-specific slugs before their substrings
const CHARGE_SLUGS = [
  'drug-trafficking', 'drug-possession', 'probation-violation',
  'white-collar', 'sex-offense', 'federal-criminal', 'self-defense',
  'other-felony', 'other-misdemeanor', 'drug', 'dui',
];

function getContextWindow(lineNo, windowSize = 20) {
  const start = Math.max(0, lineNo - 1 - windowSize);
  return lines.slice(start, lineNo - 1).join('\n');
}

function detectChargeBranch(lineNo) {
  const ctx = getContextWindow(lineNo, 40);
  for (const slug of CHARGE_SLUGS) {
    const caseRe = new RegExp(`case\\s+["'\`]${slug}["'\`]`);
    const eqRe   = new RegExp(`chargeType\\s*===\\s*["'\`]${slug}["'\`]`);
    if (caseRe.test(ctx) || eqRe.test(ctx)) {
      return slug === 'drug' ? 'drug-possession' : slug;
    }
  }
  return 'cross-cutting';
}

function detectAttorneyState(lineNo) {
  const ctx = getContextWindow(lineNo, 20);
  // noAttorney variable OR explicit hasAttorney === "no"/"not-sure"
  if (/noAttorney\b/.test(ctx) ||
      /hasAttorney\s*===\s*["'`](no|not-sure)["'`]/.test(ctx)) {
    return 'no-attorney';
  }
  if (/hasAttorney\s*===\s*["'`](private|public-defender)["'`]/.test(ctx)) {
    return 'has-attorney';
  }
  return null;
}

function detectTimeWindow(lineNo) {
  const ctx = getContextWindow(lineNo, 20);
  // late: 12-plus or timeIndex >= 3/4
  if (/12-plus-months/.test(ctx) || /timeIndex\s*>=\s*[34]/.test(ctx)) return 'late';
  // mid: 3-6 / 6-12 months or timeIndex >= 2
  if (/timeIndex\s*>=\s*2/.test(ctx) || /3-6-months|6-12-months/.test(ctx) || /mid-window/.test(ctx)) return 'mid';
  // early: explicit text or early time slugs or timeIndex < 2
  if (/early\s+window/.test(ctx) || /1-3-months|less-than-1-month/.test(ctx) || /timeIndex\s*<\s*2/.test(ctx)) return 'early';
  return null;
}

// ---------------------------------------------------------------------------
// Build and write index
// ---------------------------------------------------------------------------
const raw = extractObservationStrings();

const index = raw
  .sort((a, b) => a.lineNo - b.lineNo)
  .map(({ lineNo, text, chargeBranch }) => {
    const trimmed = text.trim();
    const hash = createHash('sha256').update(trimmed).digest('hex').slice(0, 16);
    return {
      line: lineNo,
      text_hash: hash,
      // Use pre-computed branch from Pass B (forward scan); fall back to lookback heuristic
      charge_branch: chargeBranch ?? detectChargeBranch(lineNo),
      attorney_state: detectAttorneyState(lineNo),
      time_window: detectTimeWindow(lineNo),
      source_snippet: trimmed.slice(0, 80),
    };
  });

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(index, null, 2), 'utf8');

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log(`Written: ${OUT_FILE}`);
console.log(`Row count: ${index.length}`);

const byCharge = {};
for (const row of index) {
  byCharge[row.charge_branch] = (byCharge[row.charge_branch] || 0) + 1;
}
console.log('\nBy charge_branch:');
for (const [k, v] of Object.entries(byCharge).sort()) {
  console.log(`  ${k}: ${v}`);
}

const badHashes = index.filter(r => !r.text_hash || r.text_hash.length < 16);
if (badHashes.length) console.warn(`\nWARN: ${badHashes.length} rows with invalid text_hash`);

const nullLines = index.filter(r => !r.line);
if (nullLines.length) console.warn(`WARN: ${nullLines.length} rows with null line`);

console.log('\nDone.');
