// Template: scripts/ingest/__tests__/scrape-ctbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, fixtures derived from live CL responses 2026-04-27
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-nhbar-discipline.mjs
//
// Anti-TN-bug guard: fixtures derived from VERIFIED LIVE CL responses 2026-04-27.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isNhDocket,
  normalizeNhDocket,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-nhbar-discipline.mjs';

test('isNhDocket accepts LD-YYYY-NNNN forms', () => {
  assert.ok(isNhDocket('LD-2018-0007'));
  assert.ok(isNhDocket('LD-2017-0010'));
  assert.ok(isNhDocket('LD-2016-0005'));
  assert.ok(isNhDocket('LD-2010-012'));
});

test('isNhDocket accepts en-dash variants and No. prefix', () => {
  assert.ok(isNhDocket('LD–2017–0010'));  // en-dash separators
  assert.ok(isNhDocket('No. LD-2011-006'));
});

test('isNhDocket accepts both LD- and plain YYYY-NNNN forms', () => {
  // LD-prefix: canonical lawyer-discipline form.
  // Plain YYYY-NNNN: 2019+ unified docket; caption-anchor gates noise upstream.
  assert.ok(isNhDocket('2024-0005'));
  assert.ok(isNhDocket('2019-0001'));
});

test('isNhDocket rejects empty and non-NH formats', () => {
  assert.equal(isNhDocket(''), false);
  assert.equal(isNhDocket('SCBD-1234'), false);
  assert.equal(isNhDocket('A-123'), false);
  assert.equal(isNhDocket('LD-XX-YY'), false);
});

test('normalizeNhDocket normalizes dashes + uppercase', () => {
  assert.equal(normalizeNhDocket('LD–2017–0010'), 'LD-2017-0010');
  assert.equal(normalizeNhDocket('No. LD-2011-006'), 'LD-2011-006');
  assert.equal(normalizeNhDocket('<mark>LD-2018-0007</mark>'), 'LD-2018-0007');
});

test('parseCaseName accepts <Name>\'s Case form', () => {
  assert.equal(parseCaseName("Salomon's Case").fullName, 'Salomon');
  assert.equal(parseCaseName("Gallant's Case").fullName, 'Gallant');
  assert.equal(parseCaseName("Mesmer's Case").fullName, 'Mesmer');
  assert.equal(parseCaseName("Clauson's Case").fullName, 'Clauson');
  assert.equal(parseCaseName("Wyatt's Case").fullName, 'Wyatt');
});

test('parseCaseName handles apostrophe in surname (O\'Meara)', () => {
  assert.equal(parseCaseName("O'Meara's Case").fullName, "O'Meara");
});

test('parseCaseName accepts curly apostrophes', () => {
  assert.equal(parseCaseName('Bruzga’s Case').fullName, 'Bruzga');
  assert.equal(parseCaseName('Conner’s Case').fullName, 'Conner');
  assert.equal(parseCaseName('Morse’s Case').fullName, 'Morse');
});

test('parseCaseName accepts Case of <Name>', () => {
  assert.equal(parseCaseName('Case of Conner').fullName, 'Conner');
});

test('parseCaseName rejects Appeal of <Name>', () => {
  assert.equal(parseCaseName('Appeal of Hoppock').fullName, null);
  assert.equal(parseCaseName('Appeal of Stacy').fullName, null);
  assert.equal(parseCaseName('Appeal of Estate of Beatrice Jakobiec').fullName, null);
});

test('parseCaseName rejects In the Matter of', () => {
  assert.equal(parseCaseName('In the Matter of Nadeau & Nadeau').fullName, null);
});

test('parseCaseName rejects Petition of', () => {
  assert.equal(parseCaseName('Petition of Sanjeev Lath & a.').fullName, null);
});

test('parseCaseName rejects unrelated cases mentioning ADO', () => {
  assert.equal(parseCaseName('Tessier v. Rockefeller').fullName, null);
  assert.equal(parseCaseName('Dan Hynes v. New Hampshire Democratic Party & a.').fullName, null);
  assert.equal(parseCaseName("James Conant & a. v. Timothy O'Meara & a.").fullName, null);
  assert.equal(parseCaseName('In re N.B. In re J.B.').fullName, null);
});

test('buildRecordFromClResult accepts a real-shape NH CL result', () => {
  const sample = {
    caseName: "Salomon's Case",
    docketNumber: 'LD-2018-0007',
    dateFiled: '2019-01-23',
    absolute_url: '/opinion/4583662/salomons-case/',
    snippet: '',
    opinions: [{ snippet: 'The PCC found the following facts. The <mark>Attorney Discipline</mark> Office (ADO) received two unrelated complaints' }],
  };
  const r = buildRecordFromClResult(sample, 'suspension');
  assert.ok(r);
  assert.equal(r.bar_number, 'NHSC:LD-2018-0007');
  assert.equal(r.full_name, 'Salomon');
  assert.equal(r.discipline_type, 'suspension');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/'));
});

test('buildRecordFromClResult rejects "Appeal of <Name>" caption even when docket valid', () => {
  // "Appeal of Hoppock" mentions ADO in opinion text but is not a discipline
  // order — caption-anchor gate rejects regardless of docket format.
  const sample = {
    caseName: 'Appeal of Hoppock',
    docketNumber: '2024-0005',
    dateFiled: '2025-04-24',
    absolute_url: '/opinion/x/',
    opinions: [{ snippet: 'attorney discipline office' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'suspension'), null);
});

test('buildRecordFromClResult accepts plain YYYY-NNNN docket with strong <Name>\'s Case caption', () => {
  // Mesmer's Case (LD-prefix dropped post-2019) — caption is the strong signal.
  const sample = {
    caseName: "Mesmer's Case",
    docketNumber: '2019-0001',
    dateFiled: '2020-02-21',
    absolute_url: '/opinion/4734532/mesmers-case/',
    opinions: [{ snippet: 'on the brief and orally, for the Attorney Discipline Office.' }],
  };
  const r = buildRecordFromClResult(sample, 'suspension');
  assert.ok(r);
  assert.equal(r.bar_number, 'NHSC:2019-0001');
  assert.equal(r.full_name, 'Mesmer');
});

test('buildRecordFromClResult rejects valid docket with non-discipline caption', () => {
  // Hypothetical: LD docket but caption is "Petition of X" — reject (not a discipline order).
  const sample = {
    caseName: 'Petition of Foo',
    docketNumber: 'LD-2020-001',
    dateFiled: '2020-01-01',
    absolute_url: '/opinion/x/',
    opinions: [{ snippet: 'suspended' }],
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
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('public_reprimand'));
  assert.ok(!ALLOWED_DISCIPLINE_TYPES.has('fake'));
});
