import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isSdDocket,
  buildRecordFromClResult,
  ALLOWED_DISCIPLINE_TYPES,
  normalizeDiscipline,
} from '../scrape-sdbar-discipline.mjs';

test('parseCaseName accepts canonical "Discipline of <Name>"', () => {
  assert.equal(parseCaseName('Discipline of Volesky').fullName, 'Volesky');
  assert.equal(parseCaseName('Discipline of Ravnsborg').fullName, 'Ravnsborg');
});

test('parseCaseName accepts "Reciprocal Discipline of <Name>"', () => {
  assert.equal(parseCaseName('Reciprocal Discipline of Smith').fullName, 'Smith');
});

test('parseCaseName accepts legacy "In Re the Discipline of <Name>"', () => {
  assert.equal(parseCaseName('In Re the Discipline of Tornow').fullName, 'Tornow');
});

test('parseCaseName accepts "Matter of Discipline of <Name>"', () => {
  assert.equal(parseCaseName('Matter of Discipline of Russell').fullName, 'Russell');
});

test('parseCaseName rejects criminal "State v. <Name>"', () => {
  assert.equal(parseCaseName('State v. Klager').fullName, null);
});

test('parseCaseName rejects probate "Estate of <Name>"', () => {
  assert.equal(parseCaseName('Estate of Mack').fullName, null);
});

test('parseCaseName rejects corporate dissolution', () => {
  assert.equal(parseCaseName('Dissolution of Healy Ranch, Inc.').fullName, null);
});

test('parseCaseName strips trailing Jr./Sr./II suffixes', () => {
  assert.equal(parseCaseName('Discipline of Smith, Jr.').fullName, 'Smith');
  assert.equal(parseCaseName('Discipline of Smith, III').fullName, 'Smith');
});

test('parseCaseName strips <mark> highlights', () => {
  assert.equal(parseCaseName('Discipline of <mark>Volesky</mark>').fullName, 'Volesky');
});

test('isSdDocket accepts 4-6 digit numeric', () => {
  assert.equal(isSdDocket('30736'), true);
  assert.equal(isSdDocket('29156'), true);
  assert.equal(isSdDocket('25490'), true);
  assert.equal(isSdDocket('1234'), true);
});

test('isSdDocket rejects non-numeric', () => {
  assert.equal(isSdDocket('S19587'), false);
  assert.equal(isSdDocket('25-BG-0264'), false);
  assert.equal(isSdDocket(''), false);
  assert.equal(isSdDocket(null), false);
});

test('buildRecordFromClResult builds from valid CL result', () => {
  const r = {
    caseName: 'Discipline of Volesky',
    docketNumber: '30736',
    dateFiled: '2025-11-12',
    absolute_url: '/opinion/10739463/discipline-of-volesky/',
    opinions: [{ snippet: 'Attorneys for Disciplinary Board. Suspended for two years.' }],
  };
  const rec = buildRecordFromClResult(r, 'suspension');
  assert.equal(rec.bar_number, 'SD:30736');
  assert.equal(rec.full_name, 'Volesky');
  assert.equal(rec.discipline_type, 'suspension');
  assert.equal(rec.order_date, '2025-11-12');
  assert.equal(rec.source_url, 'https://www.courtlistener.com/opinion/10739463/discipline-of-volesky/');
});

test('buildRecordFromClResult returns null for non-discipline caption', () => {
  const r = {
    caseName: 'State v. Klager',
    docketNumber: '25609',
    dateFiled: '2020-01-01',
    absolute_url: '/opinion/9/state-v-klager/',
    opinions: [{ snippet: 'criminal' }],
  };
  assert.equal(buildRecordFromClResult(r, 'suspension'), null);
});

test('buildRecordFromClResult returns null without absolute_url (never fabricate)', () => {
  const r = {
    caseName: 'Discipline of X',
    docketNumber: '30000',
    dateFiled: '2025-01-01',
    absolute_url: null,
    opinions: [{ snippet: 'x' }],
  };
  assert.equal(buildRecordFromClResult(r, 'suspension'), null);
});

test('ALLOWED_DISCIPLINE_TYPES contains the expected enum values', () => {
  for (const t of ['disbarment', 'suspension', 'interim_suspension', 'probation',
    'public_reprimand', 'resignation_with_charges', 'censure',
    'admonition', 'reciprocal_discipline', 'disability_inactive']) {
    assert.equal(ALLOWED_DISCIPLINE_TYPES.has(t), true, t);
  }
});

test('normalizeDiscipline matches expected sanction', () => {
  assert.equal(normalizeDiscipline('order of disbarment').type, 'disbarment');
  assert.equal(normalizeDiscipline('suspended for two years').type, 'suspension');
  assert.equal(normalizeDiscipline('publicly reprimanded').type, 'public_reprimand');
  assert.equal(normalizeDiscipline('').type, 'unknown');
});
