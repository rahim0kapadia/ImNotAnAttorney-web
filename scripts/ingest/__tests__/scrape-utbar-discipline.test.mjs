// Template: scripts/ingest/__tests__/scrape-okbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-utbar-discipline.mjs.
// No network, no DB.
//
// Anti-TN-bug guard: fixtures derived from VERIFIED LIVE CL responses captured
// 2026-04-27. Caption variants ("OPC v.", "In re Discipline of",
// "In the Matter of the Discipline of", "Discipline of <Name>",
// "Utah State Bar v.") and `Case No. NNNNNNN` docket prefix all match live.
//
// Usage: node --test scripts/ingest/__tests__/scrape-utbar-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isUtDocket,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-utbar-discipline.mjs';

// ── isUtDocket ──────────────────────────────────────────────────────────────

test('isUtDocket accepts 8-digit YYYYMMNN', () => {
  assert.ok(isUtDocket('20231103'));
  assert.ok(isUtDocket('20210458'));
});

test('isUtDocket accepts 7-digit older form', () => {
  assert.ok(isUtDocket('2003042'));
});

test('isUtDocket strips <mark> tags', () => {
  assert.ok(isUtDocket('<mark>2023</mark>1103'));
});

test('isUtDocket rejects empty / null / wrong format', () => {
  assert.equal(isUtDocket(''), false);
  assert.equal(isUtDocket(null), false);
  assert.equal(isUtDocket('SCBD-7480'), false);
  assert.equal(isUtDocket('25-1787'), false);
  assert.equal(isUtDocket('12345'), false); // too short
});

// ── parseCaseName ───────────────────────────────────────────────────────────

test('parseCaseName strips OPC v. prefix', () => {
  const r = parseCaseName('OPC v. Rose');
  assert.equal(r.fullName, 'Rose');
});

test('parseCaseName strips Office of Professional Conduct v. prefix', () => {
  const r = parseCaseName('Office of Professional Conduct v. Bernacchi');
  assert.equal(r.fullName, 'Bernacchi');
});

test('parseCaseName strips "In re Discipline of" prefix', () => {
  const r = parseCaseName('In re Discipline of Welker');
  assert.equal(r.fullName, 'Welker');
});

test('parseCaseName strips "In the Matter of the Discipline of" prefix', () => {
  const r = parseCaseName('In the Matter of the Discipline of Jere B. Reneer');
  assert.equal(r.fullName, 'Jere B. Reneer');
});

test('parseCaseName strips bare "Discipline of" prefix', () => {
  const r = parseCaseName('Discipline of Brian Steffensen');
  assert.equal(r.fullName, 'Brian Steffensen');
});

test('parseCaseName strips "Utah State Bar v." prefix', () => {
  const r = parseCaseName('Utah State Bar v. Bates');
  assert.equal(r.fullName, 'Bates');
});

test('parseCaseName strips <mark> wrappers', () => {
  const r = parseCaseName('<mark>OPC v</mark>. Rose');
  assert.equal(r.fullName, 'Rose');
});

test('parseCaseName rejects reversed caption (X v. OPC) — reinstatement', () => {
  const r = parseCaseName('Rose v. Office of Prof\'l Conduct');
  assert.equal(r.fullName, null);
});

test('parseCaseName rejects reversed caption (X v. Utah State Bar)', () => {
  const r = parseCaseName('Long v. Utah State Bar');
  assert.equal(r.fullName, null);
});

test('parseCaseName rejects non-discipline captions', () => {
  const r = parseCaseName('State v. Felts');
  assert.equal(r.fullName, null);
});

// ── normalizeDiscipline ─────────────────────────────────────────────────────

test('normalizeDiscipline maps disbarment', () => {
  assert.equal(normalizeDiscipline('was disbarred').type, 'disbarment');
});

test('normalizeDiscipline maps reciprocal_discipline before suspension', () => {
  assert.equal(
    normalizeDiscipline('reciprocal discipline imposed; suspended').type,
    'reciprocal_discipline',
  );
});

test('normalizeDiscipline maps interim_suspension before suspension', () => {
  assert.equal(
    normalizeDiscipline('interim suspension pending hearing').type,
    'interim_suspension',
  );
});

test('normalizeDiscipline maps admonition', () => {
  assert.equal(
    normalizeDiscipline('private admonition issued').type,
    'admonition',
  );
});

test('normalizeDiscipline returns unknown for blank text', () => {
  assert.equal(normalizeDiscipline('').type, 'unknown');
});

test('ALLOWED_DISCIPLINE_TYPES contains 10 canonical entries', () => {
  assert.equal(ALLOWED_DISCIPLINE_TYPES.size, 10);
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('public_reprimand'));
});

// ── buildRecordFromClResult ─────────────────────────────────────────────────

const LIVE_RESULT_OPC = {
  caseName: '<mark>OPC v</mark>. Rose',
  docketNumber: 'Case No. 20151037',
  dateFiled: '2017-08-15',
  absolute_url: '/opinion/4421172/opc-v-rose/',
  opinions: [
    { snippet: 'The Court orders Respondent disbarred from the practice of law.' },
  ],
};

const LIVE_RESULT_INRE = {
  caseName: '<mark>In re Discipline</mark> of Santana',
  docketNumber: 'Case No. 20191056',
  dateFiled: '2021-07-29',
  absolute_url: '/opinion/4903695/in-re-discipline-of-santana/',
  opinions: [{ snippet: 'suspended for two years' }],
};

const LIVE_RESULT_BARE = {
  caseName: 'Discipline of Brian Steffensen',
  docketNumber: 'Case No. 20140890',
  dateFiled: '2016-04-19',
  absolute_url: '/opinion/3199277/discipline-of-brian-steffensen/',
  opinions: [{ snippet: 'transferred to disability inactive status' }],
};

test('buildRecordFromClResult handles OPC v. caption + Case No. docket prefix', () => {
  const r = buildRecordFromClResult(LIVE_RESULT_OPC, 'disbarment');
  assert.ok(r);
  assert.equal(r.bar_number, 'UT:20151037');
  assert.equal(r.full_name, 'Rose');
  assert.equal(r.discipline_type, 'disbarment');
});

test('buildRecordFromClResult handles "In re Discipline of <Name>" caption', () => {
  const r = buildRecordFromClResult(LIVE_RESULT_INRE, 'suspension');
  assert.ok(r);
  assert.equal(r.full_name, 'Santana');
  assert.equal(r.discipline_type, 'suspension');
});

test('buildRecordFromClResult handles bare "Discipline of <Name>"', () => {
  const r = buildRecordFromClResult(LIVE_RESULT_BARE, 'disability_inactive');
  assert.ok(r);
  assert.equal(r.full_name, 'Brian Steffensen');
  assert.equal(r.discipline_type, 'disability_inactive');
});

test('buildRecordFromClResult skips reversed captions (X v. OPC)', () => {
  const r = buildRecordFromClResult(
    { ...LIVE_RESULT_OPC, caseName: 'Rose v. Office of Professional Conduct' },
    'disbarment',
  );
  assert.equal(r, null);
});

test('buildRecordFromClResult skips non-UT dockets', () => {
  const r = buildRecordFromClResult(
    { ...LIVE_RESULT_OPC, docketNumber: 'SCBD-7480' },
    'disbarment',
  );
  assert.equal(r, null);
});

test('buildRecordFromClResult requires absolute_url', () => {
  const r = buildRecordFromClResult(
    { ...LIVE_RESULT_OPC, absolute_url: null },
    'disbarment',
  );
  assert.equal(r, null);
});

test('buildRecordFromClResult builds HTTPS source_url', () => {
  const r = buildRecordFromClResult(LIVE_RESULT_OPC, 'disbarment');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/'));
});
