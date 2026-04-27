import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName, isRiDocket, normalizeRiDocket, normalizeDiscipline,
  buildRecordFromClResult, ALLOWED_DISCIPLINE_TYPES,
} from '../scrape-ribar-discipline.mjs';

test('parseCaseName — In the Matter of <Name>', () => {
  assert.equal(
    parseCaseName('In the Matter of Joseph Molina Flynn').fullName,
    'Joseph Molina Flynn',
  );
  assert.equal(
    parseCaseName('In the Matter of Jane I. Coogan').fullName,
    'Jane I. Coogan',
  );
});

test('parseCaseName — strips trailing Esq.', () => {
  assert.equal(
    parseCaseName('In the Matter of Santiago H. Posas, Esq.').fullName,
    'Santiago H. Posas',
  );
  assert.equal(
    parseCaseName('In the Matter of Kenneth A.D. Filarski, Esquire').fullName,
    'Kenneth A.D. Filarski',
  );
});

test('parseCaseName — keeps Jr./III suffixes', () => {
  assert.equal(
    parseCaseName('In the Matter of Joseph K. Curran, Jr.').fullName,
    'Joseph K. Curran, Jr.',
  );
});

test('parseCaseName — strips <mark> tags', () => {
  assert.equal(
    parseCaseName('<mark>In the Matter of</mark> Daniel Goldsmith Ruggiero').fullName,
    'Daniel Goldsmith Ruggiero',
  );
});

test('parseCaseName — In re <Name> form (older RI discipline)', () => {
  assert.equal(parseCaseName('In re Carden').fullName, 'Carden');
  assert.equal(parseCaseName('In re Gelfuso').fullName, 'Gelfuso');
});

test('parseCaseName — rejects State v.', () => {
  assert.equal(parseCaseName('State v. John Rainey').fullName, null);
  assert.equal(parseCaseName('State v. Andre Marizan').fullName, null);
});

test('parseCaseName — rejects civil <Name> v. <Name>', () => {
  assert.equal(parseCaseName('Smith v. Jones').fullName, null);
});

test('parseCaseName — rejects anonymous Member of the Bar caption', () => {
  assert.equal(parseCaseName('In re a Member of the Bar').fullName, null);
  assert.equal(parseCaseName('In the Matter of a Member of the Bar').fullName, null);
});

test('isRiDocket — accepts canonical YYYY-NNN-M.P.', () => {
  assert.equal(isRiDocket('2025-0331-M.P.'), true);
  assert.equal(isRiDocket('2024-0214-M.P.'), true);
  assert.equal(isRiDocket('2025-076-M.P.'), true);
});

test('isRiDocket — accepts No. prefix', () => {
  assert.equal(isRiDocket('No. 2017-393-M.P.'), true);
  assert.equal(isRiDocket('No. 2017-190-M.P.'), true);
});

test('isRiDocket — accepts combo dockets', () => {
  assert.equal(isRiDocket('2014-348-M.P. (P1/12-463A)'), true);
});

test('isRiDocket — strips <mark> tags', () => {
  assert.equal(isRiDocket('2025-0331-<mark>M.P</mark>.'), true);
});

test('isRiDocket — rejects non-M.P. dockets', () => {
  assert.equal(isRiDocket('15-322'), false);
  assert.equal(isRiDocket('SC 22-0001'), false);
  assert.equal(isRiDocket(''), false);
  assert.equal(isRiDocket(null), false);
  assert.equal(isRiDocket(undefined), false);
});

test('normalizeRiDocket — drops No. prefix and combo trailer', () => {
  assert.equal(normalizeRiDocket('No. 2017-393-M.P.'), '2017-393-M.P.');
  assert.equal(normalizeRiDocket('2014-348-M.P. (P1/12-463A)'), '2014-348-M.P.');
});

test('normalizeRiDocket — strips <mark> tags', () => {
  assert.equal(normalizeRiDocket('2025-0331-<mark>M.P</mark>.'), '2025-0331-M.P.');
});

test('normalizeDiscipline — sanction type mapping', () => {
  assert.equal(normalizeDiscipline('disbarred').type, 'disbarment');
  assert.equal(normalizeDiscipline('reprimand').type, 'public_reprimand');
  assert.equal(normalizeDiscipline('censured').type, 'censure');
  assert.equal(normalizeDiscipline('reciprocal discipline').type, 'reciprocal_discipline');
});

test('buildRecordFromClResult — builds full record', () => {
  const r = {
    docketNumber: '2025-0331-M.P.',
    caseName: 'In the Matter of Jane I. Coogan',
    dateFiled: '2026-01-23',
    absolute_url: '/opinion/9999999/in-the-matter-of-jane-i-coogan/',
    opinions: [{ snippet: 'The respondent is suspended from the practice of law.' }],
  };
  const rec = buildRecordFromClResult(r, 'suspension');
  assert.ok(rec);
  assert.equal(rec.bar_number, 'RISC:2025-0331-M.P.');
  assert.equal(rec.full_name, 'Jane I. Coogan');
  assert.equal(rec.discipline_type, 'suspension');
  assert.equal(rec.order_date, '2026-01-23');
  assert.equal(rec.source_url, 'https://www.courtlistener.com/opinion/9999999/in-the-matter-of-jane-i-coogan/');
});

test('buildRecordFromClResult — rejects bad docket', () => {
  const r = {
    docketNumber: '15-322',
    caseName: 'In the Matter of Foo',
    dateFiled: '2025-01-01',
    absolute_url: '/opinion/x/',
  };
  assert.equal(buildRecordFromClResult(r, 'suspension'), null);
});

test('buildRecordFromClResult — rejects State v. caption', () => {
  const r = {
    docketNumber: '2014-348-M.P. (P1/12-463A)',
    caseName: 'State v. John Rainey',
    dateFiled: '2018-01-11',
    absolute_url: '/opinion/x/',
  };
  assert.equal(buildRecordFromClResult(r, 'suspension'), null);
});

test('buildRecordFromClResult — rejects unknown sanction', () => {
  const r = {
    docketNumber: '2025-0001-M.P.',
    caseName: 'In the Matter of Test',
    dateFiled: '2025-01-01',
    absolute_url: '/opinion/x/',
  };
  assert.equal(buildRecordFromClResult(r, 'unknown'), null);
});

test('ALLOWED_DISCIPLINE_TYPES includes canonical set', () => {
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('suspension'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('public_reprimand'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('censure'));
});
