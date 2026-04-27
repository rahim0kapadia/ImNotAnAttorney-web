// Template: scripts/ingest/__tests__/scrape-ctbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, fixtures derived from live CL responses 2026-04-27
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-idbar-discipline.mjs
//
// Anti-TN-bug guard: fixtures derived from VERIFIED LIVE CL responses 2026-04-27.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isIdDocket,
  normalizeIdDocket,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-idbar-discipline.mjs';

test('isIdDocket accepts 4-6 digit numeric forms', () => {
  assert.ok(isIdDocket('49155'));
  assert.ok(isIdDocket('51857'));
  assert.ok(isIdDocket('38215'));
  assert.ok(isIdDocket('Docket 44219'));
  assert.ok(isIdDocket('No. 28045'));
});

test('isIdDocket rejects empty / non-numeric', () => {
  assert.equal(isIdDocket(''), false);
  assert.equal(isIdDocket('SCBD-1234'), false);
  assert.equal(isIdDocket('A123'), false);
});

test('normalizeIdDocket strips Docket/No prefix', () => {
  assert.equal(normalizeIdDocket('Docket 44219'), '44219');
  assert.equal(normalizeIdDocket('No. 28045'), '28045');
  assert.equal(normalizeIdDocket('<mark>49155</mark>'), '49155');
});

test('parseCaseName accepts Idaho State Bar v. <Name>', () => {
  assert.equal(parseCaseName('Idaho State Bar v. Smith').fullName, 'Smith');
  assert.equal(parseCaseName('Idaho State Bar v. Pangburn').fullName, 'Pangburn');
  assert.equal(parseCaseName('Idaho State Bar v. Clark').fullName, 'Clark');
  assert.equal(parseCaseName('Idaho State Bar v. Souza').fullName, 'Souza');
});

test('parseCaseName accepts ISB v. <Name>', () => {
  assert.equal(parseCaseName('ISB v. Oleson').fullName, 'Oleson');
});

test('parseCaseName rejects reverse caption (challenges to ISB)', () => {
  assert.equal(parseCaseName('Wilhelm v. Idaho State Bar').fullName, null);
  assert.equal(parseCaseName('Bennett v. Idaho State Bar').fullName, null);
  assert.equal(parseCaseName('Smith v. Idaho State Bar').fullName, null);
  assert.equal(parseCaseName('John Doe v. Idaho State Bar').fullName, null);
});

test('parseCaseName rejects ISB v. anonymous Doe', () => {
  assert.equal(parseCaseName('ISB v. John Doe').fullName, null);
  assert.equal(parseCaseName('Idaho State Bar v. Jane Doe').fullName, null);
});

test('parseCaseName rejects unrelated cases (Smith v. Hippler, etc)', () => {
  assert.equal(parseCaseName('Smith v. Hippler').fullName, null);
  assert.equal(parseCaseName('Katseanes v. Katseanes').fullName, null);
  assert.equal(parseCaseName('State v. Chambers').fullName, null);
  assert.equal(parseCaseName('Van Hook v. State').fullName, null);
  assert.equal(parseCaseName('IDHW v. John Doe & Jane Doe').fullName, null);
});

test('parseCaseName handles caseName with mark tags', () => {
  assert.equal(parseCaseName('<mark>Idaho State Bar</mark> v. Pangburn').fullName, 'Pangburn');
});

test('buildRecordFromClResult accepts a real-shape ID CL result', () => {
  const sample = {
    caseName: '<mark>Idaho State Bar</mark> v. Pangburn',
    docketNumber: '38215',
    dateFiled: '2013-02-27',
    absolute_url: '/opinion/880104/idaho-state-bar-v-pangburn/',
    snippet: '',
    opinions: [{ snippet: 'from the <mark>Idaho State Bar</mark> (ISB) that he be <mark>disbarred</mark>.' }],
  };
  const r = buildRecordFromClResult(sample, 'disbarment');
  assert.ok(r);
  assert.equal(r.bar_number, 'IDSC:38215');
  assert.equal(r.full_name, 'Pangburn');
  assert.equal(r.discipline_type, 'disbarment');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/'));
});

test('buildRecordFromClResult rejects reverse caption', () => {
  const sample = {
    caseName: 'Wilhelm v. <mark>Idaho State Bar</mark>',
    docketNumber: '29003',
    dateFiled: '2004-04-27',
    absolute_url: '/opinion/2621695/wilhelm-v-idaho-state-bar/',
    opinions: [{ snippet: 'IDAHO STATE BAR; and Defendant A, Respondents.' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'suspension'), null);
});

test('buildRecordFromClResult rejects unrelated case mentioning ISB', () => {
  const sample = {
    caseName: 'Smith v. Hippler',
    docketNumber: '51412',
    dateFiled: '2025-06-26',
    absolute_url: '/opinion/x/',
    opinions: [{ snippet: 'Idaho State Bar v. Smith, 170 Idaho 534' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'suspension'), null);
});

test('normalizeDiscipline maps standard sanctions', () => {
  assert.equal(normalizeDiscipline('disbarred').type, 'disbarment');
  assert.equal(normalizeDiscipline('publicly censured').type, 'censure');
  assert.equal(normalizeDiscipline('private reprimand').type, 'admonition');
});

test('ALLOWED_DISCIPLINE_TYPES sane', () => {
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('censure'));
  assert.ok(!ALLOWED_DISCIPLINE_TYPES.has('fake'));
});
