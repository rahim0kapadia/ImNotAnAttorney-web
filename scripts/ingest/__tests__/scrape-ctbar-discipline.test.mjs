// Template: scripts/ingest/__tests__/scrape-cobar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-ctbar-discipline.mjs
//
// Anti-TN-bug guard: fixtures derived from VERIFIED LIVE CL responses 2026-04-27.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isCtDocket,
  normalizeCtDocket,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-ctbar-discipline.mjs';

test('isCtDocket accepts SC###### and AC###### forms', () => {
  assert.ok(isCtDocket('SC21148'));
  assert.ok(isCtDocket('AC48010'));
  assert.ok(isCtDocket('AC47495'));
});

test('isCtDocket accepts comma-separated multi-docket strings (first wins)', () => {
  assert.ok(isCtDocket('AC46813, AC46890'));
});

test('isCtDocket rejects empty / non-SC/AC', () => {
  assert.equal(isCtDocket(''), false);
  assert.equal(isCtDocket('FOO123'), false);
});

test('normalizeCtDocket strips comma-separated tail', () => {
  assert.equal(normalizeCtDocket('AC46813, AC46890'), 'AC46813');
  assert.equal(normalizeCtDocket('SC21148'), 'SC21148');
});

test('parseCaseName strips OCDC prefix', () => {
  assert.equal(parseCaseName('Office of Chief Disciplinary Counsel v. Vaccaro').fullName, 'Vaccaro');
});

test('parseCaseName strips Disciplinary Counsel prefix', () => {
  assert.equal(parseCaseName('Disciplinary Counsel v. Burbank').fullName, 'Burbank');
});

test('parseCaseName strips Statewide Grievance prefix', () => {
  assert.equal(parseCaseName('Statewide Grievance Committee v. Clarke').fullName, 'Clarke');
});

test('parseCaseName strips In re prefix', () => {
  assert.equal(parseCaseName('In re Cunha').fullName, 'Cunha');
});

test('parseCaseName rejects reversed caption (Mills v. Statewide Grievance)', () => {
  assert.equal(parseCaseName('Mills v. Statewide Grievance Committee').fullName, null);
});

test('buildRecordFromClResult accepts a real-shape CT CL result', () => {
  const sample = {
    caseName: 'Office of Chief Disciplinary Counsel v. Vaccaro',
    docketNumber: '<mark>SC21047</mark>',
    dateFiled: '2025-12-23',
    absolute_url: '/opinion/10763803/office-of-chief-disciplinary-counsel-v-vaccaro/',
    snippet: '',
    opinions: [{ snippet: 'Attorney is hereby suspended from the practice of law.' }],
  };
  const r = buildRecordFromClResult(sample, 'suspension');
  assert.ok(r);
  assert.equal(r.bar_number, 'CTSC:SC21047');
  assert.equal(r.full_name, 'Vaccaro');
  assert.equal(r.discipline_type, 'suspension');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/'));
});

test('buildRecordFromClResult rejects missing source_url', () => {
  const sample = {
    caseName: 'Office of Chief Disciplinary Counsel v. Smith',
    docketNumber: 'SC21000',
    dateFiled: '2024-01-01',
    absolute_url: null,
    opinions: [{ snippet: 'suspended' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'suspension'), null);
});

test('ALLOWED_DISCIPLINE_TYPES sane', () => {
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('public_reprimand'));
  assert.ok(!ALLOWED_DISCIPLINE_TYPES.has('fake'));
});
