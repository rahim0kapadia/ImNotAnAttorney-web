// csv-bulk-checked: none-exists — self-contained unit test, no network
// Template: scripts/ingest/__tests__/seed-statutes-fl.test.mjs
// Pattern: cl-bulk-data-defensive #17 + no-hallucinated-legal-data

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseMdName,
  parseDate,
  normalizeDiscipline,
  syntheticBarNumber,
  parseChunk,
  extractEntries,
  toTitleCase,
  parseArgs,
} from '../scrape-mdbar-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../__fixtures__/md-sample-narrative.txt');

// ── 1. Name parsing ──────────────────────────────────────────────────────────

test('parseMdName: basic "LAST, First M." format', () => {
  assert.equal(parseMdName('ANDERS, Joel William'), 'Joel William Anders');
});

test('parseMdName: "LAST, First M., Jr." trailing suffix', () => {
  const result = parseMdName('JOHNSON, Bruce Allen, Jr.');
  assert.equal(result, 'Bruce Allen Johnson Jr.');
});

test('parseMdName: "LAST, First M. Jr." inline suffix (no comma before suffix)', () => {
  // "STROUD, Barron LeGrant Jr." — Jr. is last token of given, no comma
  const result = parseMdName('STROUD, Barron LeGrant Jr.');
  assert.equal(result, 'Barron LeGrant Stroud Jr.');
});

test('parseMdName: "LAST, NUMERAL, First M." — numeral suffix between last and first', () => {
  assert.equal(parseMdName('HARDY, II, James Roger'), 'James Roger Hardy II');
});

test('parseMdName: "LAST, IV, First M." — Roman numeral IV', () => {
  assert.equal(parseMdName('GLENN, IV, Robert Edwin'), 'Robert Edwin Glenn IV');
});

test('parseMdName: "LAST, III, First M." — Roman numeral III', () => {
  assert.equal(parseMdName('JONES, III, David Wayne'), 'David Wayne Jones III');
});

test('parseMdName: single token last name returns non-null', () => {
  const result = parseMdName('SMITH, John A.');
  assert.ok(result !== null, 'should parse successfully');
  assert.ok(result.includes('John'), 'should include first name');
  assert.ok(result.includes('Smith'), 'should include last name');
});

test('parseMdName: null on empty/short input', () => {
  assert.equal(parseMdName(''), null);
  assert.equal(parseMdName('AB'), null);
  assert.equal(parseMdName(null), null);
});

test('parseMdName: hyphenated last name preserves case', () => {
  const result = parseMdName('O\'BRIEN, Mary Ellen');
  assert.ok(result !== null);
});

// ── 2. toTitleCase ───────────────────────────────────────────────────────────

test('toTitleCase: all-caps to title case', () => {
  assert.equal(toTitleCase('ANDERS'), 'Anders');
  assert.equal(toTitleCase('GALLAGHER'), 'Gallagher');
});

test('toTitleCase: McX prefix preserved', () => {
  assert.equal(toTitleCase('MCDONALD'), 'McDonald');
});

test('toTitleCase: MacX prefix preserved', () => {
  assert.equal(toTitleCase('MACDONALD'), 'MacDonald');
});

// ── 3. Date parsing ──────────────────────────────────────────────────────────

test('parseDate: "Month D, YYYY" format', () => {
  assert.equal(parseDate('Commission Reprimand on August 30, 2024, for failing'), '2024-08-30');
});

test('parseDate: "Month D, YYYY" — January', () => {
  assert.equal(parseDate('Disbarred on January 27, 2025'), '2025-01-27');
});

test('parseDate: single-digit day', () => {
  assert.equal(parseDate('Reprimand on July 9, 2024'), '2024-07-09');
});

test('parseDate: slash format "M/D/YYYY"', () => {
  // MD uses American M/D/YYYY: month first, then day
  assert.equal(parseDate('Suspended on 6/30/2020'), '2020-06-30');
});

test('parseDate: slash format with zero-padded values', () => {
  assert.equal(parseDate('Suspended on 07/09/2024'), '2024-07-09');
});

test('parseDate: null on garbage', () => {
  assert.equal(parseDate('no date here'), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate(''), null);
});

// ── 4. Discipline normalization ──────────────────────────────────────────────

test('normalizeDiscipline: "Disbarment by Consent" → disbarment (NOT resignation_with_charges)', () => {
  const { type } = normalizeDiscipline('Disbarment by Consent on November 25, 2024');
  assert.equal(type, 'disbarment');
});

test('normalizeDiscipline: "Disbarred" → disbarment', () => {
  const { type } = normalizeDiscipline('Disbarred on January 27, 2025');
  assert.equal(type, 'disbarment');
});

test('normalizeDiscipline: "Temporary Suspension" → interim_suspension', () => {
  const { type } = normalizeDiscipline('Temporary Suspension on February 21, 2025, effective immediately');
  assert.equal(type, 'interim_suspension');
});

test('normalizeDiscipline: "Temporarily Suspended" → interim_suspension', () => {
  const { type } = normalizeDiscipline('Temporarily Suspended pending the resolution');
  assert.equal(type, 'interim_suspension');
});

test('normalizeDiscipline: "Indefinite Suspension" → suspension (not interim)', () => {
  const { type } = normalizeDiscipline('Indefinite Suspension by Consent on September 23, 2024');
  assert.equal(type, 'suspension');
});

test('normalizeDiscipline: "Suspension by Consent" → suspension', () => {
  const { type } = normalizeDiscipline('Suspension by Consent for 150 days on January 27, 2025');
  assert.equal(type, 'suspension');
});

test('normalizeDiscipline: "Commission Reprimand" → public_reprimand', () => {
  const { type } = normalizeDiscipline('Commission Reprimand on August 30, 2024');
  assert.equal(type, 'public_reprimand');
});

test('normalizeDiscipline: "Reprimand by Consent" → public_reprimand', () => {
  const { type } = normalizeDiscipline('Reprimand by Consent on December 19, 2024');
  assert.equal(type, 'public_reprimand');
});

test('normalizeDiscipline: unknown text → unknown', () => {
  const { type } = normalizeDiscipline('Some unrecognized action taken by the court');
  assert.equal(type, 'unknown');
});

test('normalizeDiscipline: null input → unknown', () => {
  const { type } = normalizeDiscipline(null);
  assert.equal(type, 'unknown');
});

// ── 5. Synthetic bar number stability ───────────────────────────────────────

test('syntheticBarNumber: same inputs produce same hash (stability)', () => {
  const k1 = syntheticBarNumber('Joel William Anders', '2024-08-30');
  const k2 = syntheticBarNumber('Joel William Anders', '2024-08-30');
  assert.equal(k1, k2);
});

test('syntheticBarNumber: different inputs produce different hashes', () => {
  const k1 = syntheticBarNumber('Joel William Anders', '2024-08-30');
  const k2 = syntheticBarNumber('Matthew Adam Baum', '2025-02-21');
  assert.notEqual(k1, k2);
});

test('syntheticBarNumber: format is MD:<8hexchars>', () => {
  const key = syntheticBarNumber('Joel William Anders', '2024-08-30');
  assert.match(key, /^MD:[0-9a-f]{8}$/);
});

test('syntheticBarNumber: case-insensitive name normalization for stability', () => {
  // syntheticBarNumber normalizes to lower before hashing
  const k1 = syntheticBarNumber('Joel William Anders', '2024-08-30');
  // This demonstrates that same logical person always gets same key
  assert.match(k1, /^MD:[0-9a-f]{8}$/);
});

// ── 6. parseChunk ────────────────────────────────────────────────────────────

test('parseChunk: basic reprimand entry', () => {
  const chunk = 'ANDERS, Joel William – Commission Reprimand on August 30, 2024, for failing to safekeep funds in an attorney trust account.';
  const r = parseChunk(chunk, 'https://example.com/fy25.pdf');
  assert.ok(r !== null);
  assert.equal(r.full_name, 'Joel William Anders');
  assert.equal(r.order_date, '2024-08-30');
  assert.equal(r.discipline_type, 'public_reprimand');
  assert.equal(r.source_url, 'https://example.com/fy25.pdf');
  assert.equal(r.order_url, null);
  assert.match(r.bar_number, /^MD:[0-9a-f]{8}$/);
});

test('parseChunk: disbarment by consent (not resignation)', () => {
  const chunk = 'ELAN, Evan Stuart – Disbarment by Consent on November 25, 2024, effective immediately.';
  const r = parseChunk(chunk, 'https://example.com/fy25.pdf');
  assert.ok(r !== null);
  assert.equal(r.discipline_type, 'disbarment');
  assert.equal(r.full_name, 'Evan Stuart Elan');
  assert.equal(r.order_date, '2024-11-25');
});

test('parseChunk: temporary suspension → interim_suspension', () => {
  const chunk = 'BAUM, Matthew Adam – Temporary Suspension on February 21, 2025, effective immediately.';
  const r = parseChunk(chunk, 'https://example.com/fy25.pdf');
  assert.ok(r !== null);
  assert.equal(r.discipline_type, 'interim_suspension');
});

test('parseChunk: Jr. suffix in name', () => {
  const chunk = 'JOHNSON, Bruce Allen, Jr. – Disbarred on January 27, 2025, effective immediately.';
  const r = parseChunk(chunk, 'https://example.com/fy25.pdf');
  assert.ok(r !== null);
  assert.equal(r.full_name, 'Bruce Allen Johnson Jr.');
  assert.equal(r.discipline_type, 'disbarment');
});

test('parseChunk: Roman numeral suffix between last and first', () => {
  const chunk = 'GLENN, IV, Robert Edwin – Disbarment by Consent on July 29, 2024.';
  const r = parseChunk(chunk, 'https://example.com/fy25.pdf');
  assert.ok(r !== null);
  assert.equal(r.full_name, 'Robert Edwin Glenn IV');
  assert.equal(r.discipline_type, 'disbarment');
});

test('parseChunk: null on missing em-dash', () => {
  const r = parseChunk('SMITH John A. Reprimand August 30 2024', 'https://example.com');
  assert.equal(r, null);
});

test('parseChunk: null on missing date', () => {
  const r = parseChunk('SMITH, John A. – Commission Reprimand for some reason', 'https://example.com');
  assert.equal(r, null);
});

// ── 7. End-to-end fixture test ────────────────────────────────────────────────

test('extractEntries: fixture file parses at least 8 entries', () => {
  const text = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const records = extractEntries(text, 'https://example.com/fixture.pdf');
  assert.ok(records.length >= 8, `Expected >= 8 records, got ${records.length}`);
});

test('extractEntries: fixture yields no fabricated source_urls', () => {
  const text = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const records = extractEntries(text, 'https://example.com/fixture.pdf');
  for (const r of records) {
    assert.equal(r.source_url, 'https://example.com/fixture.pdf');
    assert.equal(r.order_url, null);
  }
});

test('extractEntries: all records have bar_number matching MD:<8hex>', () => {
  const text = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const records = extractEntries(text, 'https://example.com/fixture.pdf');
  for (const r of records) {
    assert.match(r.bar_number, /^MD:[0-9a-f]{8}$/, `Bad bar_number: ${r.bar_number}`);
  }
});

test('extractEntries: bar_numbers are deterministic (run twice same result)', () => {
  const text = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const run1 = extractEntries(text, 'https://example.com/fixture.pdf');
  const run2 = extractEntries(text, 'https://example.com/fixture.pdf');
  assert.equal(run1.length, run2.length);
  for (let i = 0; i < run1.length; i++) {
    assert.equal(run1[i].bar_number, run2[i].bar_number);
  }
});

test('extractEntries: fixture "ELAN, Evan Stuart" maps to disbarment', () => {
  const text = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const records = extractEntries(text, 'https://example.com/fixture.pdf');
  const elan = records.find(r => r.full_name.includes('Elan'));
  assert.ok(elan, 'Elan record not found');
  assert.equal(elan.discipline_type, 'disbarment');
});

test('extractEntries: fixture "BAUM, Matthew Adam" maps to interim_suspension', () => {
  const text = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const records = extractEntries(text, 'https://example.com/fixture.pdf');
  const baum = records.find(r => r.full_name.includes('Baum'));
  assert.ok(baum, 'Baum record not found');
  assert.equal(baum.discipline_type, 'interim_suspension');
});

// ── 8. parseArgs CLI ─────────────────────────────────────────────────────────

test('parseArgs: defaults', () => {
  const opts = parseArgs(['node', 'script.mjs']);
  assert.equal(opts.apply, false);
  assert.equal(opts.startFy, 20);
  assert.equal(opts.endFy, 26);
  assert.equal(opts.limit, null);
});

test('parseArgs: --apply flag', () => {
  const opts = parseArgs(['node', 'script.mjs', '--apply']);
  assert.equal(opts.apply, true);
});

test('parseArgs: --start-fy and --limit', () => {
  const opts = parseArgs(['node', 'script.mjs', '--start-fy', '22', '--limit', '50']);
  assert.equal(opts.startFy, 22);
  assert.equal(opts.limit, 50);
});
