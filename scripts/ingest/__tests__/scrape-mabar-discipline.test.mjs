// test-isolation-na: read-only unit tests — no Supabase writes, no DB connection
//
// Unit tests for scripts/ingest/scrape-mabar-discipline.mjs (CL-based rewrite 2026-04-25)
// No network, no DB — exercises pure parsing logic only.
//
// Usage: node --test scripts/ingest/__tests__/scrape-mabar-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  parseCaseName,
  normalizeDocket,
  buildRecordFromClResult,
} from '../scrape-mabar-discipline.mjs';

// ── normalizeDiscipline ───────────────────────────────────────────────────────

test('normalizeDiscipline maps "disbarred" → disbarment', () => {
  assert.equal(normalizeDiscipline('Respondent was disbarred by the SJC.').type, 'disbarment');
});

test('normalizeDiscipline maps "disbarment by consent" → disbarment', () => {
  assert.equal(normalizeDiscipline('disbarring Mary Anne Johnson by consent').type, 'disbarment');
});

test('normalizeDiscipline maps "indefinitely suspended" → suspension', () => {
  assert.equal(normalizeDiscipline('be indefinitely suspended from practice').type, 'suspension');
});

test('normalizeDiscipline maps "suspended" → suspension', () => {
  assert.equal(normalizeDiscipline('Respondent was suspended for two years.').type, 'suspension');
});

test('normalizeDiscipline maps "interim suspension" → interim_suspension', () => {
  assert.equal(normalizeDiscipline('ordered interim suspension pending investigation').type, 'interim_suspension');
});

test('normalizeDiscipline maps "probation" → probation', () => {
  assert.equal(normalizeDiscipline('placed on probation for 18 months').type, 'probation');
});

test('normalizeDiscipline maps "public reprimand" → public_reprimand', () => {
  assert.equal(normalizeDiscipline('issued a public reprimand to respondent').type, 'public_reprimand');
});

test('normalizeDiscipline maps "censure" → censure', () => {
  assert.equal(normalizeDiscipline('issued a censure for the conduct').type, 'censure');
});

test('normalizeDiscipline maps "admonition" → admonition', () => {
  assert.equal(normalizeDiscipline('issued an admonition to Patricia Ann Brown').type, 'admonition');
});

test('normalizeDiscipline maps "resignation with pending charges" → resignation_with_charges', () => {
  assert.equal(normalizeDiscipline('accepted the resignation with pending charges').type, 'resignation_with_charges');
});

test('normalizeDiscipline maps "reciprocal discipline" → reciprocal_discipline', () => {
  assert.equal(normalizeDiscipline('imposed reciprocal discipline based on NY order').type, 'reciprocal_discipline');
});

test('normalizeDiscipline returns unknown for unrecognized text', () => {
  assert.equal(normalizeDiscipline('some unrecognized sanction type').type, 'unknown');
});

test('normalizeDiscipline returns unknown for SJC boilerplate notice', () => {
  // SJC snippets are boilerplate — should produce unknown, not crash
  const snippet = 'NOTICE: All slip opinions and orders are subject to formal revision.';
  assert.equal(normalizeDiscipline(snippet).type, 'unknown');
});

test('normalizeDiscipline returns unknown for null', () => {
  const r = normalizeDiscipline(null);
  assert.equal(r.type, 'unknown');
  assert.equal(r.raw, null);
});

// ── ALLOWED_DISCIPLINE_TYPES ──────────────────────────────────────────────────

test('ALLOWED_DISCIPLINE_TYPES contains all 11 required enum values', () => {
  const required = [
    'disbarment', 'suspension', 'interim_suspension', 'probation',
    'public_reprimand', 'resignation_with_charges', 'censure',
    'admonition', 'reciprocal_discipline', 'disability_inactive',
    'unknown', // SJC snippets are boilerplate; every "In the Matter of" docket IS discipline
  ];
  for (const t of required) {
    assert.ok(ALLOWED_DISCIPLINE_TYPES.has(t), `missing type: ${t}`);
  }
});

// ── parseCaseName ─────────────────────────────────────────────────────────────

test('parseCaseName strips "In the Matter of" prefix', () => {
  const { fullName } = parseCaseName('In the Matter of Benjamin Behnam Tariri');
  assert.ok(fullName, 'should return a name');
  assert.ok(!fullName.toLowerCase().includes('matter of'), 'prefix not stripped: ' + fullName);
});

test('parseCaseName normalizes ALL-CAPS surname', () => {
  const { fullName } = parseCaseName('In the Matter of Edward A. SARGENT');
  assert.ok(fullName, 'should return a name');
  assert.ok(!fullName.includes('SARGENT'), 'ALL-CAPS leaked: ' + fullName);
  assert.ok(fullName.includes('Sargent'), 'should be title-cased: ' + fullName);
});

test('parseCaseName rejects "In the Matter of an Impounded Case"', () => {
  const { fullName } = parseCaseName('In the Matter of an Impounded Case');
  assert.equal(fullName, null, 'impounded case should return null');
});

test('parseCaseName rejects "In the Matter of the Discipline of Two Attorneys"', () => {
  const { fullName } = parseCaseName('In the Matter of the Discipline of Two Attorneys');
  assert.equal(fullName, null, 'multi-attorney caption should return null');
});

test('parseCaseName returns null for empty input', () => {
  const { fullName } = parseCaseName('');
  assert.equal(fullName, null);
});

test('parseCaseName returns null for null input', () => {
  const { fullName } = parseCaseName(null);
  assert.equal(fullName, null);
});

test('parseCaseName handles three-token name', () => {
  const { fullName } = parseCaseName('In the Matter of David Glenn Baker');
  assert.ok(fullName, 'should return a name');
  assert.ok(fullName.includes('Baker'), 'should include last name: ' + fullName);
});

// ── normalizeDocket ───────────────────────────────────────────────────────────

test('normalizeDocket leaves SJC-NNNNN unchanged', () => {
  assert.equal(normalizeDocket('SJC-13370'), 'SJC-13370');
});

test('normalizeDocket converts "SJC 13370" (space) to "SJC-13370"', () => {
  assert.equal(normalizeDocket('SJC 13370'), 'SJC-13370');
});

test('normalizeDocket returns null for null input', () => {
  assert.equal(normalizeDocket(null), null);
});

test('normalizeDocket returns null for empty string', () => {
  assert.equal(normalizeDocket(''), null);
});

// ── buildRecordFromClResult ───────────────────────────────────────────────────

test('buildRecordFromClResult produces MASJC: bar_number prefix', () => {
  const r = buildRecordFromClResult({
    caseName: 'In the Matter of Benjamin Behnam Tariri',
    docketNumber: 'SJC-13370',
    dateFiled: '2025-10-14',
    opinions: [{ snippet: 'NOTICE: All slip opinions and orders are subject to formal revision.' }],
    absolute_url: '/opinion/10018283/in-the-matter-of-tariri/',
  });
  assert.ok(r, 'should return a record');
  assert.equal(r.bar_number, 'MASJC:SJC-13370');
});

test('buildRecordFromClResult normalizes "SJC 13370" docket', () => {
  const r = buildRecordFromClResult({
    caseName: 'In the Matter of Edward A. Sargent',
    docketNumber: 'SJC 13545',
    dateFiled: '2025-09-03',
    opinions: [{ snippet: 'SUPREME JUDICIAL COURT IN THE MATTER OF EDWARD A. SARGENT' }],
    absolute_url: '/opinion/10099001/sargent/',
  });
  assert.ok(r, 'should return a record');
  assert.equal(r.bar_number, 'MASJC:SJC-13545');
});

test('buildRecordFromClResult has discipline_type unknown for SJC boilerplate snippet', () => {
  const r = buildRecordFromClResult({
    caseName: 'In the Matter of David Glenn Baker',
    docketNumber: 'SJC-13600',
    dateFiled: '2025-08-18',
    opinions: [{ snippet: 'NOTICE: All slip opinions are subject to formal revision.' }],
    absolute_url: '/opinion/10018044/baker/',
  });
  assert.ok(r, 'should return a record (unknown is allowed)');
  assert.equal(r.discipline_type, 'unknown');
});

test('buildRecordFromClResult extracts disbarment when in snippet', () => {
  const r = buildRecordFromClResult({
    caseName: 'In the Matter of Robert Williams',
    docketNumber: 'SJC-13700',
    dateFiled: '2024-06-01',
    opinions: [{ snippet: 'Respondent was disbarred effective June 1, 2024.' }],
    absolute_url: '/opinion/10018999/williams/',
  });
  assert.ok(r, 'should return a record');
  assert.equal(r.discipline_type, 'disbarment');
});

test('buildRecordFromClResult returns null for non-SJC docket', () => {
  const r = buildRecordFromClResult({
    caseName: 'In the Matter of Someone',
    docketNumber: 'SJC-13370-A',  // non-standard
    dateFiled: '2025-01-01',
    opinions: [{ snippet: 'Respondent was suspended.' }],
    absolute_url: '/opinion/99999/someone/',
  });
  assert.equal(r, null, 'non-SJC docket should return null');
});

test('buildRecordFromClResult returns null for impounded caption', () => {
  const r = buildRecordFromClResult({
    caseName: 'In the Matter of an Impounded Case',
    docketNumber: 'SJC-13866',
    dateFiled: '2026-03-19',
    opinions: [{ snippet: 'Order entered.' }],
    absolute_url: '/opinion/10200001/impounded/',
  });
  assert.equal(r, null, 'impounded case should return null');
});

test('buildRecordFromClResult reads snippet from opinions[0].snippet not r.snippet', () => {
  const r = buildRecordFromClResult({
    caseName: 'In the Matter of Jane A. Doe',
    docketNumber: 'SJC-13400',
    dateFiled: '2024-01-15',
    snippet: 'top-level snippet — should be ignored',  // should NOT be used
    opinions: [{ snippet: 'Respondent was suspended for one year.' }],
    absolute_url: '/opinion/11000001/doe/',
  });
  assert.ok(r, 'should return a record');
  assert.equal(r.discipline_type, 'suspension');  // from opinions[0].snippet, not top-level
});

test('buildRecordFromClResult includes CourtListener source_url', () => {
  const r = buildRecordFromClResult({
    caseName: 'In the Matter of Michael Brown',
    docketNumber: 'SJC-13450',
    dateFiled: '2024-03-10',
    opinions: [{ snippet: 'Respondent was censured.' }],
    absolute_url: '/opinion/11000002/brown/',
  });
  assert.ok(r, 'should return a record');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com'), r.source_url);
});

test('buildRecordFromClResult returns null when absolute_url missing', () => {
  const r = buildRecordFromClResult({
    caseName: 'In the Matter of Someone',
    docketNumber: 'SJC-13500',
    dateFiled: '2024-06-01',
    opinions: [{ snippet: 'Respondent was suspended.' }],
    absolute_url: null,
  });
  assert.equal(r, null, 'missing source_url should return null');
});
