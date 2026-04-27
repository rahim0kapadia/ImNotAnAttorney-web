// Template: scripts/ingest/__tests__/scrape-okbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-nvbar-discipline.mjs.
// No network, no DB.
//
// Anti-TN-bug guard: caption fixtures here mirror VERIFIED LIVE CL responses
// captured 2026-04-27 for court=nev. Notable: caseName comes back wrapped in
// <mark> tags from highlight=on, e.g. "<mark>In Re: Discipline</mark> Of
// Gianna M. Orlandi". `parseCaseName` strips them before prefix matching.
//
// Usage: node --test scripts/ingest/__tests__/scrape-nvbar-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isNvDiscipDocket,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-nvbar-discipline.mjs';

// ── isNvDiscipDocket ────────────────────────────────────────────────────────

test('isNvDiscipDocket accepts 5-digit dockets', () => {
  assert.ok(isNvDiscipDocket('85346'));
  assert.ok(isNvDiscipDocket('86781'));
});

test('isNvDiscipDocket accepts 4-digit older dockets', () => {
  assert.ok(isNvDiscipDocket('1234'));
});

test('isNvDiscipDocket strips <mark> tags', () => {
  assert.ok(isNvDiscipDocket('<mark>85346</mark>'));
});

test('isNvDiscipDocket rejects ADKT (rule-change dockets)', () => {
  assert.equal(isNvDiscipDocket('ADKT 0461'), false);
  assert.equal(isNvDiscipDocket('ADKT-0123'), false);
});

test('isNvDiscipDocket rejects empty / null / non-numeric', () => {
  assert.equal(isNvDiscipDocket(''), false);
  assert.equal(isNvDiscipDocket(null), false);
  assert.equal(isNvDiscipDocket('SCBD-7480'), false);
});

// ── parseCaseName ───────────────────────────────────────────────────────────

test('parseCaseName strips "In Re: Discipline Of" with <mark> wrapper', () => {
  const r = parseCaseName('<mark>In Re: Discipline</mark> Of Gianna M. Orlandi');
  assert.equal(r.fullName, 'Gianna M. Orlandi');
  assert.equal(r.isReinstatement, false);
});

test('parseCaseName handles space variant', () => {
  const r = parseCaseName('In re Discipline of Melissa F. Mack');
  assert.equal(r.fullName, 'Melissa F. Mack');
});

test('parseCaseName strips "In re Resignation of" prefix', () => {
  const r = parseCaseName('In re Resignation of John Doe');
  assert.equal(r.fullName, 'John Doe');
});

test('parseCaseName flags reinstatements as isReinstatement', () => {
  const r = parseCaseName('In re Reinstatement of Jane Smith');
  assert.equal(r.fullName, null);
  assert.equal(r.isReinstatement, true);
});

test('parseCaseName strips reciprocal-discipline form', () => {
  const r = parseCaseName('In Re: Reciprocal Discipline of Sarah Lee');
  assert.equal(r.fullName, 'Sarah Lee');
});

test('parseCaseName rejects unrelated captions', () => {
  const r = parseCaseName('State v. Smith');
  assert.equal(r.fullName, null);
});

test('parseCaseName strips trailing Bar No.', () => {
  const r = parseCaseName('In re Discipline of John Doe, Bar No. 12345');
  assert.equal(r.fullName, 'John Doe');
});

test('parseCaseName normalizes ALL-CAPS to Title-case', () => {
  const r = parseCaseName('IN RE DISCIPLINE OF JOHN SMITH');
  assert.equal(r.fullName, 'John Smith');
});

// ── normalizeDiscipline ─────────────────────────────────────────────────────

test('normalizeDiscipline maps reciprocal_discipline first', () => {
  assert.equal(
    normalizeDiscipline('reciprocal discipline; respondent suspended').type,
    'reciprocal_discipline',
  );
});

test('normalizeDiscipline maps disbarment', () => {
  assert.equal(normalizeDiscipline('disbarred').type, 'disbarment');
});

test('normalizeDiscipline maps interim_suspension before suspension', () => {
  assert.equal(
    normalizeDiscipline('interim suspension pending hearing').type,
    'interim_suspension',
  );
});

test('normalizeDiscipline maps probation', () => {
  assert.equal(normalizeDiscipline('placed on probation').type, 'probation');
});

test('normalizeDiscipline returns unknown for blank input', () => {
  assert.equal(normalizeDiscipline('').type, 'unknown');
  assert.equal(normalizeDiscipline(null).type, 'unknown');
});

test('ALLOWED_DISCIPLINE_TYPES has 10 entries', () => {
  assert.equal(ALLOWED_DISCIPLINE_TYPES.size, 10);
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('admonition'));
});

// ── buildRecordFromClResult ─────────────────────────────────────────────────

const LIVE_RESULT = {
  caseName: '<mark>In Re: Discipline</mark> Of Gianna M. Orlandi',
  docketNumber: '85346',
  dateFiled: '2022-11-22',
  absolute_url: '/opinion/9302751/in-re-discipline-of-gianna-m-orlandi/',
  opinions: [{ snippet: 'reciprocal discipline imposed; six-month suspension' }],
};

test('buildRecordFromClResult builds full record from live shape', () => {
  const r = buildRecordFromClResult(LIVE_RESULT, 'reciprocal_discipline');
  assert.ok(r);
  assert.equal(r.bar_number, 'NV:85346');
  assert.equal(r.full_name, 'Gianna M. Orlandi');
  assert.equal(r.discipline_type, 'reciprocal_discipline');
  assert.equal(r.order_date, '2022-11-22');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/'));
});

test('buildRecordFromClResult skips reinstatement captions', () => {
  const r = buildRecordFromClResult(
    { ...LIVE_RESULT, caseName: 'In re Reinstatement of John Smith' },
    'suspension',
  );
  assert.equal(r, null);
});

test('buildRecordFromClResult skips ADKT dockets', () => {
  const r = buildRecordFromClResult(
    { ...LIVE_RESULT, docketNumber: 'ADKT-0461' },
    'suspension',
  );
  assert.equal(r, null);
});

test('buildRecordFromClResult requires absolute_url', () => {
  const r = buildRecordFromClResult(
    { ...LIVE_RESULT, absolute_url: null },
    'suspension',
  );
  assert.equal(r, null);
});

test('buildRecordFromClResult requires dateFiled', () => {
  const r = buildRecordFromClResult(
    { ...LIVE_RESULT, dateFiled: null },
    'suspension',
  );
  assert.equal(r, null);
});

test('buildRecordFromClResult uses caller-asserted sanction type', () => {
  // Snippet says reciprocal but caller asserts disbarment.
  const r = buildRecordFromClResult(LIVE_RESULT, 'disbarment');
  assert.ok(r);
  assert.equal(r.discipline_type, 'disbarment');
});
