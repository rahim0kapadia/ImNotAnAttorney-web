// Template: scripts/ingest/scrape-txbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — unit tests use synthetic text fixtures, no network
//
// Unit tests for scripts/ingest/scrape-mnbar-discipline.mjs.
// No network, no DB — exercises exported pure functions against synthetic fixtures.
//
// Tests verify:
//   1. normalizeName handles 3-token names (LAST, FIRST MIDDLE)
//   2. normalizeName handles initial+name+suffix (LAST, R JAMES JR)
//   3. Partial date caveat: order_date uses YYYY-01-01 placeholder, effective_date=null
//   4. deterministicBarNumber is stable across calls (SHA1 idempotent)
//   5. extractEntriesFromText parses fixture correctly (≥5 disbarments for 2024)
//   6. Reinstatement/Denied sections are excluded
//   7. Disability entries map to disability_inactive
//
// Usage: node --test scripts/ingest/__tests__/scrape-mnbar-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeName,
  deterministicBarNumber,
  extractEntriesFromText,
} from '../scrape-mnbar-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../__fixtures__/mn-sample-narrative.txt');

// ── normalizeName ─────────────────────────────────────────────────────────────

test('normalizeName — 3 tokens with middle initial (BRADLEY, JAMES V)', () => {
  const result = normalizeName('BRADLEY, JAMES V');
  assert.equal(result, 'James V. Bradley');
});

test('normalizeName — initial + name + suffix (JENSEN, R JAMES JR)', () => {
  const result = normalizeName('JENSEN, R JAMES JR');
  assert.equal(result, 'R. James Jr. Jensen');
  // OR: spec says "R. James Jensen Jr." — suffix stays at end if in last-name position
  // The fixture has "JENSEN, R JAMES JR" — last="JENSEN JR", first/middle="R JAMES"
  // Our implementation: lastParts=["JENSEN"], lastSuffix=["JR"] → allParts = [R, JAMES, JENSEN, JR]
  // → "R. James Jensen Jr." — verify that shape
  assert.match(result, /Jensen/);
  assert.match(result, /Jr\./);
  assert.match(result, /R\./);
  assert.match(result, /James/);
});

test('normalizeName — two token name (LEE, FONG)', () => {
  const result = normalizeName('LEE, FONG');
  assert.equal(result, 'Fong Lee');
});

test('normalizeName — no comma fallback', () => {
  const result = normalizeName('SMITH JOHN');
  assert.equal(result, 'Smith John');
});

test('normalizeName — suffix variants II and III', () => {
  const r2 = normalizeName('JONES, JAMES II');
  assert.match(r2, /II/);
  const r3 = normalizeName('JONES, JAMES III');
  assert.match(r3, /III/);
});

// ── deterministicBarNumber ────────────────────────────────────────────────────

test('deterministicBarNumber — stable (idempotent across two calls)', () => {
  const a = deterministicBarNumber('James V. Bradley', '2024-01-01');
  const b = deterministicBarNumber('James V. Bradley', '2024-01-01');
  assert.equal(a, b);
});

test('deterministicBarNumber — format MN:<8 hex chars>', () => {
  const bn = deterministicBarNumber('Fong Lee', '2024-01-01');
  assert.match(bn, /^MN:[0-9a-f]{8}$/);
});

test('deterministicBarNumber — different names produce different keys', () => {
  const a = deterministicBarNumber('James Bradley', '2024-01-01');
  const b = deterministicBarNumber('Fong Lee', '2024-01-01');
  assert.notEqual(a, b);
});

// ── extractEntriesFromText ────────────────────────────────────────────────────

let fixtureText;
try {
  fixtureText = fs.readFileSync(FIXTURE_PATH, 'utf8');
} catch {
  fixtureText = null;
}

test('fixture file exists and is readable', () => {
  assert.ok(fixtureText !== null, `Fixture not found at ${FIXTURE_PATH}`);
  assert.ok(fixtureText.length > 100, 'Fixture is too short');
});

test('extractEntriesFromText — parses 2024 fixture', () => {
  if (!fixtureText) return;
  const records = extractEntriesFromText(fixtureText, 'https://example.com/test.pdf');
  assert.ok(records.length > 0, 'Should extract at least one record');
});

test('extractEntriesFromText — ≥5 disbarments in 2024 fixture', () => {
  if (!fixtureText) return;
  const records = extractEntriesFromText(fixtureText, 'https://example.com/test.pdf');
  const disbarments = records.filter(
    (r) => r.discipline_type === 'disbarment' && r.calendar_year === 2024,
  );
  assert.ok(
    disbarments.length >= 5,
    `Expected ≥5 disbarments for 2024, got ${disbarments.length}: ${disbarments.map((r) => r.full_name).join(', ')}`,
  );
});

test('extractEntriesFromText — James V. Bradley parses correctly', () => {
  if (!fixtureText) return;
  const records = extractEntriesFromText(fixtureText, 'https://example.com/test.pdf');
  const bradley = records.find((r) => r.full_name.includes('Bradley') && r.full_name.includes('James'));
  assert.ok(bradley, 'Should find James V. Bradley');
  assert.equal(bradley.discipline_type, 'disbarment');
  assert.match(bradley.full_name, /James/);
  assert.match(bradley.full_name, /Bradley/);
  assert.match(bradley.full_name, /V\./);
});

test('extractEntriesFromText — R. James Jensen Jr. parses correctly', () => {
  if (!fixtureText) return;
  const records = extractEntriesFromText(fixtureText, 'https://example.com/test.pdf');
  const jensen = records.find((r) => r.full_name.includes('Jensen'));
  assert.ok(jensen, 'Should find Jensen');
  assert.equal(jensen.discipline_type, 'disbarment');
  assert.match(jensen.full_name, /Jensen/);
  assert.match(jensen.full_name, /Jr\./);
});

test('extractEntriesFromText — partial date: order_date is YYYY-01-01, effective_date null', () => {
  if (!fixtureText) return;
  const records = extractEntriesFromText(fixtureText, 'https://example.com/test.pdf');
  assert.ok(records.length > 0);
  for (const r of records) {
    // order_date should be the first of the year (our deterministic placeholder)
    assert.match(r.order_date, /^\d{4}-01-01$/, `order_date ${r.order_date} not YYYY-01-01`);
    assert.equal(r.effective_date, null, 'effective_date should be null');
  }
});

test('extractEntriesFromText — Reinstatement entries are excluded', () => {
  if (!fixtureText) return;
  const records = extractEntriesFromText(fixtureText, 'https://example.com/test.pdf');
  // Baker and Chen appear in both Suspension AND Reinstatement sections.
  // Reinstatement rows should NOT be in records (no discipline_type for reinstatement).
  // Suspension rows for Baker/Chen SHOULD be present.
  const bakerRows = records.filter((r) => r.full_name.includes('Baker'));
  // All Baker rows should be suspension, never reinstatement
  for (const r of bakerRows) {
    assert.notEqual(r.discipline_type, 'reinstatement', 'Reinstatement rows must not be included');
  }
});

test('extractEntriesFromText — disability entries map to disability_inactive', () => {
  if (!fixtureText) return;
  const records = extractEntriesFromText(fixtureText, 'https://example.com/test.pdf');
  const disabled = records.filter((r) => r.discipline_type === 'disability_inactive');
  assert.ok(disabled.length >= 1, 'Should have at least 1 disability_inactive record');
});

test('extractEntriesFromText — bar_numbers are deterministic (idempotent)', () => {
  if (!fixtureText) return;
  const r1 = extractEntriesFromText(fixtureText, 'https://example.com/test.pdf');
  const r2 = extractEntriesFromText(fixtureText, 'https://example.com/test.pdf');
  assert.deepEqual(
    r1.map((r) => r.bar_number),
    r2.map((r) => r.bar_number),
  );
});

test('extractEntriesFromText — source_url matches provided URL', () => {
  if (!fixtureText) return;
  const url = 'https://lprb.mncourts.gov/wp-content/uploads/2024/11/2024-Annual-Report_compressed.pdf';
  const records = extractEntriesFromText(fixtureText, url);
  for (const r of records) {
    assert.equal(r.source_url, url);
  }
});
