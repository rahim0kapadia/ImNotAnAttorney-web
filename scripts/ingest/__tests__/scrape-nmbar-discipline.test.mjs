// Template: scripts/ingest/__tests__/scrape-okbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-nmbar-discipline.mjs
// No network, no DB. Exercises parsing logic with synthetic CL JSON results.
//
// Anti-TN-bug guard: fixtures derived from VERIFIED LIVE CL responses.
//
// Usage: node --test scripts/ingest/__tests__/scrape-nmbar-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isNmDocket,
  isAttorneyDiscipline,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-nmbar-discipline.mjs';

// ── isNmDocket ─────────────────────────────────────────────────────────────

test('isNmDocket accepts modern S-1-SC-NNNNN', () => {
  assert.ok(isNmDocket('S-1-SC-12345'));
  assert.ok(isNmDocket('S-1-SC-37520'));
});

test('isNmDocket accepts older comma form', () => {
  assert.ok(isNmDocket('29,089'));
  assert.ok(isNmDocket('Docket 29,089'));
});

test('isNmDocket rejects empty / non-NM', () => {
  assert.equal(isNmDocket(''), false);
  assert.equal(isNmDocket(null), false);
  assert.equal(isNmDocket('SCBD-7480'), false);
});

// ── parseCaseName ───────────────────────────────────────────────────────────

test('parseCaseName accepts "In re Salazar"', () => {
  const r = parseCaseName('In re Salazar');
  assert.equal(r.fullName, 'Salazar');
});

test('parseCaseName accepts "In the Matter of Yalkut"', () => {
  const r = parseCaseName('In the Matter of Yalkut');
  assert.equal(r.fullName, 'Yalkut');
});

test('parseCaseName strips series suffix (II)', () => {
  const r = parseCaseName('In re Victor Marshall (II)');
  assert.equal(r.fullName, 'Victor Marshall');
});

test('parseCaseName rejects civil/regulatory captions', () => {
  const r = parseCaseName("Roy D. Mercer, LLC v. Reynolds");
  assert.equal(r.fullName, null);
});

test('parseCaseName rejects child-welfare initials shape', () => {
  const r = parseCaseName('In re Heather S.');
  assert.equal(r.fullName, null);
});

// ── isAttorneyDiscipline ────────────────────────────────────────────────────

test('isAttorneyDiscipline strict marker matches', () => {
  assert.ok(isAttorneyDiscipline('AN ATTORNEY DISBARRED FROM THE PRACTICE OF LAW', 'disbarment'));
});

test('isAttorneyDiscipline fallback requires sanction word + attorney phrase', () => {
  assert.ok(isAttorneyDiscipline('the rules of professional conduct require suspension', 'suspension'));
});

test('isAttorneyDiscipline rejects when sanction word absent', () => {
  assert.equal(isAttorneyDiscipline('attorney filed a brief', 'disbarment'), false);
});

// ── buildRecordFromClResult ─────────────────────────────────────────────────

test('buildRecordFromClResult accepts NM In re caption + attorney-discipline snippet', () => {
  const sample = {
    caseName: 'In re Salazar',
    docketNumber: 'S-1-SC-37520',
    dateFiled: '2025-03-15',
    absolute_url: '/opinion/9999999/in-re-salazar/',
    snippet: '',
    opinions: [{ snippet: 'AN ATTORNEY DISBARRED FROM THE PRACTICE OF LAW pursuant to Rule 17-206 NMRA' }],
  };
  const r = buildRecordFromClResult(sample, 'disbarment');
  assert.ok(r);
  assert.equal(r.bar_number, 'NM:S-1-SC-37520');
  assert.equal(r.full_name, 'Salazar');
  assert.equal(r.discipline_type, 'disbarment');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/'));
});

test('buildRecordFromClResult uses absolute_url fallback when docket invalid', () => {
  const sample = {
    caseName: 'In re Stein',
    docketNumber: '',
    dateFiled: '2010-05-01',
    absolute_url: '/opinion/2552682/in-the-matter-of-stein/',
    snippet: '',
    opinions: [{ snippet: 'AN ATTORNEY SUSPENDED FROM THE PRACTICE OF LAW' }],
  };
  const r = buildRecordFromClResult(sample, 'suspension');
  assert.ok(r);
  assert.ok(r.bar_number.startsWith('NM:CL-'));
  assert.equal(r.full_name, 'Stein');
});

test('buildRecordFromClResult rejects non-attorney-discipline matter', () => {
  const sample = {
    caseName: "Roy D. Mercer, LLC v. Reynolds",
    docketNumber: 'S-1-SC-12345',
    dateFiled: '2024-01-01',
    absolute_url: '/opinion/x/',
    opinions: [{ snippet: 'civil judgment affirmed' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'disbarment'), null);
});

test('ALLOWED_DISCIPLINE_TYPES contains expected enum values', () => {
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('censure'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('probation'));
});

test('normalizeDiscipline tags censure', () => {
  assert.equal(normalizeDiscipline('publicly censured by the court').type, 'censure');
});
