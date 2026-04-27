// Template: scripts/ingest/__tests__/seed-statutes-fl.test.mjs
// Pattern: cl-bulk-data-defensive #19 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — self-contained unit test, synthetic + fixture HTML
//
// Unit tests for extractAkJudges (lib/judge-profiles-html.mjs).
// No network, no DB — uses saved HTML fixtures and synthetic snippets.
//
// Covers:
//   1. Main index: PDF-linked "First Last" names extracted correctly
//   2. Main index: PDF-linked "Last, First M" names normalised to "First M Last"
//   3. Magistrate page: <span>-based names extracted correctly
//   4. Deduplication: same (first+last) from both sources produces one entry
//   5. Skip: non-judge PDF links (senior-judges, Careers) are excluded
//   6. Fixture smoke test: ≥50 unique judges from saved HTML pages

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractAkJudges } from '../lib/judge-profiles-html.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '../__fixtures__');

// ---------------------------------------------------------------------------
// Helper: minimal index HTML with one PDF-linked judge (padded to ≥500 chars)
// ---------------------------------------------------------------------------
const PAD = '<!-- padding ' + 'x'.repeat(500) + ' -->';

function makeIndexHtml(pdfPath, nameText) {
  return `<!DOCTYPE html><html><body>${PAD}
<a href="${pdfPath}" target="_blank">${nameText}</a>
</body></html>`;
}

function makeMjHtml(name) {
  return `<!DOCTYPE html><html><body>${PAD}
<td class="trnospacetop"><span>${name}<br>
Anchorage<br>
Appointed 2021</span></td>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Test 1 — First-Last format from main index
// ---------------------------------------------------------------------------
test('extractAkJudges: PDF-linked "First Last" name extracted', () => {
  const html = makeIndexHtml('docs/abc.pdf', 'Susan M. Carney');
  const result = extractAkJudges(html);
  assert.equal(result.length, 1);
  assert.equal(result[0].fullName, 'Susan M. Carney');
  assert.equal(result[0].first, 'Susan');
  assert.equal(result[0].last, 'Carney');
  assert.ok(result[0].bioUrl.includes('courts.alaska.gov/judges/'), 'bioUrl should point to index page');
});

// ---------------------------------------------------------------------------
// Test 2 — "Last, First M" format normalised
// ---------------------------------------------------------------------------
test('extractAkJudges: PDF-linked "Last, First M" normalised to "First M Last"', () => {
  const html = makeIndexHtml('docs/agm.pdf', 'Mead, Amy G');
  const result = extractAkJudges(html);
  assert.equal(result.length, 1);
  assert.equal(result[0].fullName, 'Amy G Mead');
  assert.equal(result[0].first, 'Amy');
  assert.equal(result[0].last, 'Mead');
});

// ---------------------------------------------------------------------------
// Test 3 — Magistrate names from mj.htm
// ---------------------------------------------------------------------------
test('extractAkJudges: magistrate span-based name extracted from mjHtml', () => {
  const mjHtml = makeMjHtml('Judson Adams');
  const result = extractAkJudges('', mjHtml);
  assert.equal(result.length, 1);
  assert.equal(result[0].fullName, 'Judson Adams');
  assert.equal(result[0].first, 'Judson');
  assert.equal(result[0].last, 'Adams');
  assert.ok(result[0].bioUrl.includes('mj.htm'), 'magistrate bioUrl should be mj.htm');
});

// ---------------------------------------------------------------------------
// Test 4 — Deduplication across sources
// ---------------------------------------------------------------------------
test('extractAkJudges: duplicate first+last across sources produces one entry', () => {
  // Same judge appears in both index and mj pages (unlikely but must handle)
  const indexHtml = makeIndexHtml('docs/ja.pdf', 'Judson Adams');
  const mjHtml = makeMjHtml('Judson Adams');
  const result = extractAkJudges(indexHtml, mjHtml);
  assert.equal(result.length, 1, 'should deduplicate');
});

// ---------------------------------------------------------------------------
// Test 5 — Skip non-judge PDF links
// ---------------------------------------------------------------------------
test('extractAkJudges: senior-judges PDF link is skipped', () => {
  const html = makeIndexHtml('docs/senior-judges.pdf', 'Appellate Courts');
  const result = extractAkJudges(html);
  assert.equal(result.length, 0);
});

test('extractAkJudges: Careers link is skipped', () => {
  const html = `<!DOCTYPE html><html><body>
<a href="https://public.courts.alaska.gov/web/scheduled/docs/RecruitmentNews.pdf" target="_blank">Careers</a>
</body></html>`;
  const result = extractAkJudges(html);
  assert.equal(result.length, 0);
});

// ---------------------------------------------------------------------------
// Test 6 — Both name formats can be adjacent without cross-contamination
// ---------------------------------------------------------------------------
test('extractAkJudges: multiple judges extracted without contamination', () => {
  const html = `<!DOCTYPE html><html><body>${PAD}
<a href="docs/smc.pdf" target="_blank">Susan M. Carney</a>
<a href="docs/agm.pdf" target="_blank">Mead, Amy G</a>
<a href="docs/db.pdf" target="_blank">Dario Borghesan</a>
</body></html>`;
  const result = extractAkJudges(html);
  assert.equal(result.length, 3);
  const names = result.map(r => r.fullName).sort();
  assert.ok(names.includes('Dario Borghesan'));
  assert.ok(names.includes('Susan M. Carney'));
  assert.ok(names.includes('Amy G Mead'));
});

// ---------------------------------------------------------------------------
// Test 7 — Fixture smoke test: real HTML → ≥50 unique judges
// ---------------------------------------------------------------------------
test('extractAkJudges fixture: ≥50 unique judges from saved HTML', () => {
  const indexPath = path.join(FIXTURES, 'ak-index.html');
  const mjPath = path.join(FIXTURES, 'ak-mj.html');

  // Skip if fixtures not saved yet (CI without network)
  if (!fs.existsSync(indexPath) || !fs.existsSync(mjPath)) {
    console.log('  [SKIP] fixture files not found — run from local environment');
    return;
  }

  const indexHtml = fs.readFileSync(indexPath, 'utf-8');
  const mjHtml = fs.readFileSync(mjPath, 'utf-8');
  const result = extractAkJudges(indexHtml, mjHtml);

  console.log('  Fixture total: ' + result.length + ' unique judges');
  for (const r of result.slice(0, 5)) {
    console.log('    ' + r.fullName + ' [' + r.bioUrl.split('/').pop() + ']');
  }

  assert.ok(result.length >= 50, 'expected ≥50 unique judges, got ' + result.length);
  // Verify every entry has required fields
  for (const r of result) {
    assert.ok(r.fullName && r.fullName.length > 3, 'fullName must be non-trivial');
    assert.ok(r.first && r.first.length >= 1, 'first must be set');
    assert.ok(r.last && r.last.length >= 1, 'last must be set');
    assert.ok(r.bioUrl && r.bioUrl.startsWith('https://'), 'bioUrl must be https');
    assert.equal(typeof r.fullName, 'string');
  }
});
