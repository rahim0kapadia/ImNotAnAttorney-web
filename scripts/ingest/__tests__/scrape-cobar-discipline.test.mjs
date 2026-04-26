// Template: scripts/ingest/__tests__/seed-statutes-fl.test.mjs (pattern source)
// Pattern: cl-bulk-data-defensive #18 (COPY FROM STDIN via bulkCopyRows)
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
// test-isolation-na: read-only unit test with injected fetch — no Supabase writes
//
// Unit tests for scripts/ingest/scrape-cobar-discipline.mjs
// No network, no DB — exercises parsing logic with synthetic CL JSON fixtures.
//
// Usage: node --test scripts/ingest/__tests__/scrape-cobar-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Import the pure parsing helpers exported for testing.
import {
  parseCaseName,
  isPdjDocket,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-cobar-discipline.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../__fixtures__/co-sample.html');

// ── Load fixture ─────────────────────────────────────────────────────────────

function loadFixture() {
  const html = readFileSync(FIXTURE_PATH, 'utf8');
  const match = html.match(/<script[^>]*id="co-fixture"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('co-sample.html missing <script id="co-fixture">');
  return JSON.parse(match[1]);
}

// ── isPdjDocket ──────────────────────────────────────────────────────────────

test('isPdjDocket accepts standard YYPDJnnn', () => {
  assert.ok(isPdjDocket('20PDJ063'));
  assert.ok(isPdjDocket('23PDJ012'));
  assert.ok(isPdjDocket('99PDJ116'));
  assert.ok(isPdjDocket('15PDJ011'));
});

test('isPdjDocket rejects SA (Supreme Court appeal) dockets', () => {
  assert.equal(isPdjDocket('24SA216'), false);
  assert.equal(isPdjDocket('20SA81'), false);
});

test('isPdjDocket rejects empty / null', () => {
  assert.equal(isPdjDocket(''), false);
  assert.equal(isPdjDocket(null), false);
  assert.equal(isPdjDocket(undefined), false);
});

test('isPdjDocket is case-insensitive', () => {
  assert.ok(isPdjDocket('20pdj063'));
  assert.ok(isPdjDocket('20Pdj063'));
});

// ── parseCaseName ─────────────────────────────────────────────────────────────

test('parseCaseName strips "The PEOPLE of the State of Colorado v." prefix', () => {
  const { fullName, regNum } = parseCaseName(
    'The PEOPLE of the State of Colorado v. Brenda L. STOREY, 25828'
  );
  assert.ok(fullName, 'fullName should be truthy');
  assert.ok(!fullName.includes('PEOPLE'), 'prefix not stripped: ' + fullName);
  assert.equal(regNum, '25828');
});

test('parseCaseName strips "People v." short prefix', () => {
  const { fullName } = parseCaseName('People v. Douglas Leo ROMERO, 35464');
  assert.ok(fullName);
  assert.ok(!fullName.includes('People'), fullName);
});

test('parseCaseName strips "In the Matter of" prefix', () => {
  const { fullName } = parseCaseName('In the Matter of Igor Raykin Attorney-Respondent');
  assert.ok(fullName);
  assert.ok(!fullName.toLowerCase().includes('matter of'), fullName);
});

test('parseCaseName normalizes ALL-CAPS surname', () => {
  const { fullName } = parseCaseName('People v. Douglas Leo ROMERO, 35464');
  // "ROMERO" should be title-cased to "Romero"
  assert.ok(fullName.includes('Romero'), 'ALL-CAPS not normalized: ' + fullName);
  assert.ok(!fullName.includes('ROMERO'), 'ALL-CAPS leaked: ' + fullName);
});

test('parseCaseName returns null for reversed caption (reinstatement)', () => {
  const { fullName } = parseCaseName('Matthew S. PARK v. The PEOPLE of the State of Colorado');
  assert.equal(fullName, null, 'reversed caption should return null');
});

test('parseCaseName returns null for empty input', () => {
  const { fullName, regNum } = parseCaseName('');
  assert.equal(fullName, null);
  assert.equal(regNum, null);
});

test('parseCaseName returns regNum null when not present', () => {
  const { fullName, regNum } = parseCaseName('People v. Jane Doe');
  assert.ok(fullName);
  assert.equal(regNum, null);
});

test('parseCaseName handles #-prefixed reg numbers', () => {
  const { regNum } = parseCaseName('Matthew S. PARK, #31715 v. People');
  // reversed caption → fullName null
  // But test the # stripping separately:
  const { regNum: r2 } = parseCaseName('People v. Jane A. DOE, #55123');
  assert.equal(r2, '55123');
});

// ── normalizeDiscipline ───────────────────────────────────────────────────────

test('normalizeDiscipline maps "suspended" → suspension', () => {
  const { type } = normalizeDiscipline('Respondent was suspended for one year.');
  assert.equal(type, 'suspension');
});

test('normalizeDiscipline maps "disbarred" → disbarment', () => {
  const { type } = normalizeDiscipline('Respondent was disbarred from the practice of law.');
  assert.equal(type, 'disbarment');
});

test('normalizeDiscipline maps "publicly censured" → censure', () => {
  const { type } = normalizeDiscipline('Respondent was publicly censured by the Presiding Disciplinary Judge.');
  assert.equal(type, 'censure');
});

test('normalizeDiscipline maps "censured" alone → censure', () => {
  const { type } = normalizeDiscipline('Respondent was censured.');
  assert.equal(type, 'censure');
});

test('normalizeDiscipline maps "private admonition" → admonition', () => {
  const { type } = normalizeDiscipline('Respondent received a private admonition.');
  assert.equal(type, 'admonition');
});

test('normalizeDiscipline maps "reciprocal discipline" → reciprocal_discipline', () => {
  const { type } = normalizeDiscipline('Order of reciprocal discipline entered.');
  assert.equal(type, 'reciprocal_discipline');
});

test('normalizeDiscipline maps "disability inactive" → disability_inactive', () => {
  const { type } = normalizeDiscipline('Respondent placed on disability inactive status.');
  assert.equal(type, 'disability_inactive');
});

test('normalizeDiscipline returns unknown for non-discipline text', () => {
  const { type } = normalizeDiscipline('Court heard oral argument on the motion.');
  assert.equal(type, 'unknown');
});

test('normalizeDiscipline returns unknown for null', () => {
  const { type } = normalizeDiscipline(null);
  assert.equal(type, 'unknown');
});

test('normalizeDiscipline prefers interim_suspension over suspension', () => {
  const { type } = normalizeDiscipline('Interim suspension imposed pending investigation.');
  assert.equal(type, 'interim_suspension');
});

test('normalizeDiscipline prefers disbarment over resignation_with_charges', () => {
  // "disciplinary revocation" is resignation_with_charges but "disbarred" is disbarment
  const { type } = normalizeDiscipline('Respondent was disbarred; disciplinary revocation noted.');
  assert.equal(type, 'disbarment');
});

// ── ALLOWED_DISCIPLINE_TYPES ──────────────────────────────────────────────────

test('ALLOWED_DISCIPLINE_TYPES contains all 10 required enum values', () => {
  const required = [
    'disbarment', 'suspension', 'interim_suspension', 'probation',
    'public_reprimand', 'resignation_with_charges', 'censure',
    'admonition', 'reciprocal_discipline', 'disability_inactive',
  ];
  for (const t of required) {
    assert.ok(ALLOWED_DISCIPLINE_TYPES.has(t), `missing type: ${t}`);
  }
});

// ── buildRecordFromClResult ───────────────────────────────────────────────────

test('buildRecordFromClResult produces COPDJ: bar_number prefix', () => {
  const r = buildRecordFromClResult({
    caseName: 'The PEOPLE of the State of Colorado v. Brenda L. STOREY, 25828',
    docketNumber: '20PDJ063',
    dateFiled: '2022-11-10',
    snippet: 'Respondent was suspended from the practice of law for one year and one day.',
    absolute_url: '/opinion/10018283/people-v-storey/',
  });
  assert.ok(r, 'should return a record');
  assert.equal(r.bar_number, 'COPDJ:20PDJ063');
});

test('buildRecordFromClResult includes CourtListener source_url', () => {
  const r = buildRecordFromClResult({
    caseName: 'People v. Douglas Leo ROMERO, 35464',
    docketNumber: '20PDJ067',
    dateFiled: '2021-11-23',
    snippet: 'Respondent was disbarred from the practice of law.',
    absolute_url: '/opinion/10018044/people-v-romero/',
  });
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com'), r.source_url);
});

test('buildRecordFromClResult returns null for SA docket', () => {
  const r = buildRecordFromClResult({
    caseName: 'In the Matter of Igor Raykin',
    docketNumber: '24SA216',
    dateFiled: '2025-03-24',
    snippet: 'Discipline appeal.',
    absolute_url: '/opinion/10363525/raykin/',
  });
  assert.equal(r, null, 'SA docket should return null');
});

test('buildRecordFromClResult returns null for unknown discipline type', () => {
  const r = buildRecordFromClResult({
    caseName: 'People v. Jane Doe, 55000',
    docketNumber: '23PDJ099',
    dateFiled: '2024-01-01',
    snippet: 'Court considered briefing schedule.',
    absolute_url: '/opinion/10000001/doe/',
  });
  assert.equal(r, null, 'unknown discipline type should return null');
});

test('buildRecordFromClResult strips "People v." from full_name', () => {
  const r = buildRecordFromClResult({
    caseName: 'People v. Jane A. DOE, 55123',
    docketNumber: '23PDJ012',
    dateFiled: '2024-03-15',
    snippet: 'Respondent was publicly censured by the Presiding Disciplinary Judge.',
    absolute_url: '/opinion/10099001/people-v-doe/',
  });
  assert.ok(r, 'should produce a record');
  assert.ok(!r.full_name.toLowerCase().includes('people'), 'prefix not stripped: ' + r.full_name);
});

// ── Fixture round-trip ────────────────────────────────────────────────────────

test('fixture parses to expected 3 results', () => {
  const fixture = loadFixture();
  assert.equal(fixture.results.length, 3);
});

test('fixture result[0] produces suspension record', () => {
  const fixture = loadFixture();
  const r = buildRecordFromClResult({
    ...fixture.results[0],
    docketNumber: fixture.results[0].docketNumber,
  });
  assert.ok(r, 'fixture result[0] should produce a record');
  assert.equal(r.discipline_type, 'suspension');
  assert.equal(r.bar_number, 'COPDJ:20PDJ063');
});

test('fixture result[1] produces disbarment record', () => {
  const fixture = loadFixture();
  const r = buildRecordFromClResult({
    ...fixture.results[1],
    docketNumber: fixture.results[1].docketNumber,
  });
  assert.ok(r, 'fixture result[1] should produce a record');
  assert.equal(r.discipline_type, 'disbarment');
  assert.equal(r.bar_number, 'COPDJ:20PDJ067');
});

test('fixture result[2] produces censure record', () => {
  const fixture = loadFixture();
  const r = buildRecordFromClResult({
    ...fixture.results[2],
    docketNumber: fixture.results[2].docketNumber,
  });
  assert.ok(r, 'fixture result[2] should produce a record');
  assert.equal(r.discipline_type, 'censure');
  assert.equal(r.bar_number, 'COPDJ:23PDJ012');
});

test('all fixture records have non-null source_url', () => {
  const fixture = loadFixture();
  for (const result of fixture.results) {
    const r = buildRecordFromClResult({
      ...result,
      docketNumber: result.docketNumber,
    });
    if (r) {
      assert.ok(r.source_url, 'source_url must not be null — no-hallucinated-legal-data rule');
      assert.ok(r.source_url.startsWith('https://'), 'source_url must be HTTPS');
    }
  }
});

test('all fixture records have COPDJ: bar_number prefix', () => {
  const fixture = loadFixture();
  for (const result of fixture.results) {
    const r = buildRecordFromClResult({
      ...result,
      docketNumber: result.docketNumber,
    });
    if (r) {
      assert.ok(r.bar_number.startsWith('COPDJ:'), 'bar_number prefix wrong: ' + r.bar_number);
    }
  }
});
