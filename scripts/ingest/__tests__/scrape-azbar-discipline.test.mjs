// Template: scripts/ingest/scrape-calbar-discipline.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — synthetic fixtures only, no network calls
// test-isolation-na: read-only unit tests, no DB writes

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeDiscipline,
  parseMDY,
  cleanName,
  parseDateCaseCol,
  parseTableRows,
  parseYearPage,
  parseArgs,
} from '../scrape-azbar-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../__fixtures__/az-sample.html');

// ── normalizeDiscipline ───────────────────────────────────────────────────────

test('normalizeDiscipline: disbarment', () => {
  assert.equal(normalizeDiscipline('Disbarment').type, 'disbarment');
});

test('normalizeDiscipline: Disbarment by Consent -> disbarment', () => {
  assert.equal(normalizeDiscipline('Disbarment by Consent').type, 'disbarment');
});

test('normalizeDiscipline: suspension', () => {
  assert.equal(normalizeDiscipline('Suspension (6 months)').type, 'suspension');
});

test('normalizeDiscipline: interim suspension', () => {
  assert.equal(normalizeDiscipline('Interim Suspension').type, 'interim_suspension');
  // Interim must win over plain suspension.
  assert.equal(normalizeDiscipline('Interim Suspension (pending investigation)').type, 'interim_suspension');
});

test('normalizeDiscipline: probation', () => {
  assert.equal(normalizeDiscipline('Probation (1 year)').type, 'probation');
});

test('normalizeDiscipline: public reprimand', () => {
  assert.equal(normalizeDiscipline('Public Reprimand').type, 'public_reprimand');
  assert.equal(normalizeDiscipline('Reprimand').type, 'public_reprimand');
});

test('normalizeDiscipline: resignation_with_charges', () => {
  assert.equal(normalizeDiscipline('Resignation with Charges Pending').type, 'resignation_with_charges');
  assert.equal(normalizeDiscipline('Resignation with Disciplinary Charges').type, 'resignation_with_charges');
});

test('normalizeDiscipline: censure', () => {
  assert.equal(normalizeDiscipline('Censure').type, 'censure');
});

test('normalizeDiscipline: admonition', () => {
  assert.equal(normalizeDiscipline('Admonition').type, 'admonition');
  assert.equal(normalizeDiscipline('Admonishment').type, 'admonition');
});

test('normalizeDiscipline: reciprocal discipline', () => {
  assert.equal(normalizeDiscipline('Reciprocal Discipline - Suspension').type, 'reciprocal_discipline');
});

test('normalizeDiscipline: disability inactive', () => {
  assert.equal(normalizeDiscipline('Disability Inactive').type, 'disability_inactive');
});

test('normalizeDiscipline: unknown for unrecognised text', () => {
  assert.equal(normalizeDiscipline('Some novel sanction').type, 'unknown');
});

test('normalizeDiscipline: null input', () => {
  const r = normalizeDiscipline(null);
  assert.equal(r.type, 'unknown');
  assert.equal(r.raw, null);
});

test('normalizeDiscipline: preserves raw text', () => {
  const r = normalizeDiscipline('Suspension (6 months)');
  assert.equal(r.raw, 'Suspension (6 months)');
});

// ── parseMDY ──────────────────────────────────────────────────────────────────

test('parseMDY: standard MM/DD/YYYY', () => {
  assert.equal(parseMDY('03/15/2024'), '2024-03-15');
});

test('parseMDY: pads single-digit month and day', () => {
  assert.equal(parseMDY('1/5/2024'), '2024-01-05');
});

test('parseMDY: returns null for unparseable input', () => {
  assert.equal(parseMDY('not-a-date'), null);
  assert.equal(parseMDY(''), null);
  assert.equal(parseMDY(null), null);
});

test('parseMDY: returns null for ISO format (not MM/DD/YYYY)', () => {
  assert.equal(parseMDY('2024-03-15'), null);
});

// ── cleanName ─────────────────────────────────────────────────────────────────

test('cleanName: strips "In re " prefix', () => {
  assert.equal(cleanName('In re John A. Smith'), 'John A. Smith');
});

test('cleanName: strips "Matter of " prefix', () => {
  assert.equal(cleanName('Matter of Jane B. Doe'), 'Jane B. Doe');
});

test('cleanName: case-insensitive prefix strip', () => {
  assert.equal(cleanName('IN RE Robert Williams'), 'Robert Williams');
  assert.equal(cleanName('MATTER OF Lisa Brown'), 'Lisa Brown');
});

test('cleanName: no-op when no prefix', () => {
  assert.equal(cleanName('Thomas G. Martinez'), 'Thomas G. Martinez');
});

test('cleanName: null passthrough', () => {
  assert.equal(cleanName(null), null);
});

// ── parseDateCaseCol ──────────────────────────────────────────────────────────

test('parseDateCaseCol: plain date with em-dash', () => {
  const r = parseDateCaseCol('03/15/2024 — SB-23-0042-D');
  assert.equal(r.orderDate, '2024-03-15');
  assert.equal(r.effectiveDate, null);
  assert.equal(r.caseNumber, 'SB-23-0042-D');
});

test('parseDateCaseCol: effective date variant', () => {
  const r = parseDateCaseCol('06/12/2024 effective 07/01/2024 — SB-24-0007-AP');
  assert.equal(r.orderDate, '2024-06-12');
  assert.equal(r.effectiveDate, '2024-07-01');
  assert.equal(r.caseNumber, 'SB-24-0007-AP');
});

test('parseDateCaseCol: HTML entity em-dash &#8212;', () => {
  // After HTML decoding by stripTags, entity becomes unicode em-dash.
  const r = parseDateCaseCol('09/10/2024 — SB-24-0015-D');
  assert.equal(r.caseNumber, 'SB-24-0015-D');
  assert.equal(r.orderDate, '2024-09-10');
});

test('parseDateCaseCol: spaced hyphen variant', () => {
  const r = parseDateCaseCol('03/15/2024 - SB-23-0042-D');
  assert.equal(r.caseNumber, 'SB-23-0042-D');
  assert.equal(r.orderDate, '2024-03-15');
});

test('parseDateCaseCol: missing case number returns nulls', () => {
  const r = parseDateCaseCol('05/01/2024');
  assert.equal(r.caseNumber, null);
  assert.equal(r.orderDate, null);
  assert.equal(r.effectiveDate, null);
});

test('parseDateCaseCol: empty string returns nulls', () => {
  const r = parseDateCaseCol('');
  assert.equal(r.caseNumber, null);
});

test('parseDateCaseCol: upcases case number', () => {
  const r = parseDateCaseCol('03/15/2024 — sb-23-0042-d');
  assert.equal(r.caseNumber, 'SB-23-0042-D');
});

// ── parseTableRows ────────────────────────────────────────────────────────────

test('parseTableRows: extracts cells from simple HTML table', () => {
  const html = `
    <table>
      <tr><th>Col A</th><th>Col B</th><th>Col C</th></tr>
      <tr><td>Value 1</td><td>Value 2</td><td>Value 3</td></tr>
      <tr><td>Value 4</td><td>Value 5</td><td>Value 6</td></tr>
    </table>
  `;
  const rows = parseTableRows(html);
  // th rows have no <td> so only data rows are returned.
  assert.ok(rows.length >= 2);
  assert.deepEqual(rows[0], ['Value 1', 'Value 2', 'Value 3']);
});

test('parseTableRows: decodes HTML entities in cells', () => {
  const html = `<table><tr><td>A &amp; B</td><td>x &#8212; y</td><td>C</td></tr></table>`;
  const rows = parseTableRows(html);
  assert.equal(rows[0][0], 'A & B');
  assert.equal(rows[0][1], 'x — y');
});

test('parseTableRows: skips rows with fewer than 3 cells', () => {
  const html = `<table>
    <tr><td>Only one</td></tr>
    <tr><td>A</td><td>B</td><td>C</td></tr>
  </table>`;
  const rows = parseTableRows(html);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], ['A', 'B', 'C']);
});

// ── parseYearPage with fixture ────────────────────────────────────────────────

test('parseYearPage: parses fixture file correctly', () => {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const records = parseYearPage(html, 'https://www.azcourts.gov/test', 2024);

  // Fixture has 12 rows; row 12 has no case number and should be skipped.
  assert.equal(records.length, 11);
});

test('parseYearPage: strips "In re" and "Matter of" from names', () => {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const records = parseYearPage(html, 'https://www.azcourts.gov/test', 2024);

  const names = records.map((r) => r.full_name);
  assert.ok(!names.some((n) => /^in re /i.test(n)), 'No name should start with "In re"');
  assert.ok(!names.some((n) => /^matter of /i.test(n)), 'No name should start with "Matter of"');
});

test('parseYearPage: bar_number prefixed with AZSC:', () => {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const records = parseYearPage(html, 'https://www.azcourts.gov/test', 2024);

  for (const r of records) {
    assert.ok(r.bar_number.startsWith('AZSC:'), `Expected AZSC: prefix, got: ${r.bar_number}`);
  }
});

test('parseYearPage: first row is disbarment for John A. Smith', () => {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const records = parseYearPage(html, 'https://www.azcourts.gov/test', 2024);

  const smith = records.find((r) => r.full_name === 'John A. Smith');
  assert.ok(smith, 'Should find John A. Smith');
  assert.equal(smith.bar_number, 'AZSC:SB-23-0042-D');
  assert.equal(smith.discipline_type, 'disbarment');
  assert.equal(smith.order_date, '2024-03-15');
  assert.equal(smith.effective_date, null);
});

test('parseYearPage: effective date row parsed correctly', () => {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const records = parseYearPage(html, 'https://www.azcourts.gov/test', 2024);

  const doe = records.find((r) => r.full_name === 'Jane B. Doe');
  assert.ok(doe, 'Should find Jane B. Doe');
  assert.equal(doe.bar_number, 'AZSC:SB-24-0007-AP');
  assert.equal(doe.order_date, '2024-06-12');
  assert.equal(doe.effective_date, '2024-07-01');
  assert.equal(doe.discipline_type, 'suspension');
});

test('parseYearPage: Disbarment by Consent maps to disbarment', () => {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const records = parseYearPage(html, 'https://www.azcourts.gov/test', 2024);

  const williams = records.find((r) => r.full_name === 'Robert C. Williams');
  assert.ok(williams, 'Should find Robert C. Williams');
  assert.equal(williams.discipline_type, 'disbarment');
});

test('parseYearPage: all enum discipline types covered in fixture', () => {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const records = parseYearPage(html, 'https://www.azcourts.gov/test', 2024);

  const types = new Set(records.map((r) => r.discipline_type));
  const expected = [
    'disbarment', 'suspension', 'public_reprimand', 'resignation_with_charges',
    'interim_suspension', 'censure', 'probation', 'reciprocal_discipline',
    'admonition', 'disability_inactive',
  ];
  for (const t of expected) {
    assert.ok(types.has(t), `Expected discipline type "${t}" to appear in fixture`);
  }
});

test('parseYearPage: source_url propagated to all records', () => {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const sourceUrl = 'https://www.azcourts.gov/attorneydiscipline/2024test';
  const records = parseYearPage(html, sourceUrl, 2024);

  for (const r of records) {
    assert.equal(r.source_url, sourceUrl);
  }
});

test('parseYearPage: skips row with no case number', () => {
  const html = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const records = parseYearPage(html, 'https://www.azcourts.gov/test', 2024);

  // "Unknown Attorney" row (row 12) has no case number — should be absent.
  const unknown = records.find((r) => /unknown attorney/i.test(r.full_name));
  assert.equal(unknown, undefined);
});

// ── parseArgs ─────────────────────────────────────────────────────────────────

test('parseArgs: defaults', () => {
  const opts = parseArgs([]);
  assert.equal(opts.apply, false);
  assert.equal(opts.startYear, 2010);
  assert.equal(opts.endYear, 2025);
  assert.equal(opts.limit, Infinity);
});

test('parseArgs: --apply sets apply=true', () => {
  const opts = parseArgs(['--apply']);
  assert.equal(opts.apply, true);
});

test('parseArgs: --start-year / --end-year', () => {
  const opts = parseArgs(['--start-year', '2020', '--end-year', '2022']);
  assert.equal(opts.startYear, 2020);
  assert.equal(opts.endYear, 2022);
});

test('parseArgs: --limit', () => {
  const opts = parseArgs(['--limit', '50']);
  assert.equal(opts.limit, 50);
});

test('parseArgs: throws when start > end', () => {
  assert.throws(() => parseArgs(['--start-year', '2022', '--end-year', '2020']), /start-year/);
});

test('parseArgs: throws on invalid --limit', () => {
  assert.throws(() => parseArgs(['--limit', 'abc']), /limit/);
});

test('parseArgs: throws on unknown argument', () => {
  assert.throws(() => parseArgs(['--unknown-flag']), /Unknown argument/);
});
