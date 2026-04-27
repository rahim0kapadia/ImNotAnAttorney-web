// Template: scripts/ingest/__tests__/scrape-cobar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-orbar-discipline.mjs
//
// Anti-TN-bug guard: fixtures derived from VERIFIED LIVE CL responses 2026-04-27.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isOrScDocket,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-orbar-discipline.mjs';

test('isOrScDocket accepts SNNNNNN form', () => {
  assert.ok(isOrScDocket('S071725'));
  assert.ok(isOrScDocket('S071019'));
  assert.ok(isOrScDocket('S063514'));
});

test('isOrScDocket rejects empty / non-S forms', () => {
  assert.equal(isOrScDocket(''), false);
  assert.equal(isOrScDocket(null), false);
  assert.equal(isOrScDocket('CC2024'), false);
  assert.equal(isOrScDocket('AC123'), false);
});

test('parseCaseName strips "In re " prefix', () => {
  assert.equal(parseCaseName('In re Clark').fullName, 'Clark');
  assert.equal(parseCaseName('In re Munn').fullName, 'Munn');
});

test('parseCaseName strips "In re the Conduct of"', () => {
  assert.equal(parseCaseName('In re the Conduct of John Smith').fullName, 'John Smith');
});

test('parseCaseName strips "In re Complaint as to the Conduct of"', () => {
  assert.equal(parseCaseName('In re Complaint as to the Conduct of Jane Doe').fullName, 'Jane Doe');
});

test('parseCaseName rejects court phrase residue', () => {
  assert.equal(parseCaseName('In re Disciplinary Board').fullName, null);
});

test('normalizeDiscipline tags suspension', () => {
  assert.equal(normalizeDiscipline('attorney suspended for 30 days').type, 'suspension');
});

test('buildRecordFromClResult accepts a real-shape OR CL result', () => {
  const sample = {
    caseName: 'In re Clark',
    docketNumber: '<mark>S071725</mark>',
    dateFiled: '2025-12-30',
    absolute_url: '/opinion/10766585/in-re-clark/',
    snippet: '',
    opinions: [{ snippet: 'Anne-Marie W. Clark suspended from the practice of law for two years.' }],
  };
  const r = buildRecordFromClResult(sample, 'suspension');
  assert.ok(r);
  assert.equal(r.bar_number, 'ORSC:S071725');
  assert.equal(r.full_name, 'Clark');
  assert.equal(r.discipline_type, 'suspension');
  assert.equal(r.order_date, '2025-12-30');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/'));
});

test('buildRecordFromClResult rejects missing source_url (no fabrication)', () => {
  const sample = {
    caseName: 'In re Smith',
    docketNumber: 'S099999',
    dateFiled: '2024-01-01',
    absolute_url: null,
    opinions: [{ snippet: 'suspended' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'suspension'), null);
});

test('ALLOWED_DISCIPLINE_TYPES sane', () => {
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('reciprocal_discipline'));
  assert.ok(!ALLOWED_DISCIPLINE_TYPES.has('fake'));
});
