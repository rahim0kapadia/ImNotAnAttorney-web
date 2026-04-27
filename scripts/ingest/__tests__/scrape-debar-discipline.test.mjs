import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName, isDeDocket, normalizeDeDocket, normalizeDiscipline,
  buildRecordFromClResult, ALLOWED_DISCIPLINE_TYPES,
} from '../scrape-debar-discipline.mjs';

test('parseCaseName — In the Matter of a Member of the Bar: <Name>', () => {
  assert.equal(
    parseCaseName('In the Matter of a Member of the Bar: Matthew M. Carucci').fullName,
    'Matthew M. Carucci',
  );
});

test('parseCaseName — IMO the Bar of the Supreme Court of Delaware: <Name>', () => {
  assert.equal(
    parseCaseName('IMO the Bar of the Supreme Court of Delaware: Robert S. Bria').fullName,
    'Robert S. Bria',
  );
});

test('parseCaseName — Matter of Member of the Bar: <Name>', () => {
  assert.equal(parseCaseName('Matter of Member of the Bar: Tease').fullName, 'Tease');
  assert.equal(
    parseCaseName('Matter of a Member of the Bar: Donald C. Vavala, III').fullName,
    'Donald C. Vavala, III',
  );
});

test('parseCaseName — strips <mark> tags', () => {
  assert.equal(
    parseCaseName('Matter of a Member of the <mark>Bar</mark>: Hornbeck').fullName,
    'Hornbeck',
  );
});

test('parseCaseName — In re <Name> form', () => {
  assert.equal(parseCaseName('In re Hornbeck').fullName, 'Hornbeck');
  assert.equal(parseCaseName('In re Vavala').fullName, 'Vavala');
});

test('parseCaseName — strips trailing Esq.', () => {
  assert.equal(
    parseCaseName('Matter of a Member of the Bar: John Doe, Esq.').fullName,
    'John Doe',
  );
});

test('parseCaseName — rejects anonymous "Member of the Bar" without colon+name', () => {
  // This is the single most important rejection — DE redacts attorney names
  // in some discipline orders; the caption is "In the Matter of a Member of
  // the Bar of the Supreme Court of Delaware" with NO colon and NO name.
  assert.equal(
    parseCaseName('In the Matter of a Member of the Bar of the Supreme Court of Delaware').fullName,
    null,
  );
  assert.equal(
    parseCaseName('IMO a Member of the Bar of the Supreme Court of Delaware').fullName,
    null,
  );
  assert.equal(
    parseCaseName('In re a Member of the Bar of the Supreme Court of the State of Delaware').fullName,
    null,
  );
});

test('parseCaseName — rejects State v.', () => {
  assert.equal(parseCaseName('State v. Smith').fullName, null);
});

test('parseCaseName — rejects In re a Member', () => {
  assert.equal(parseCaseName('In re a Member of the Bar').fullName, null);
});

test('isDeDocket — accepts canonical NNN, YYYY', () => {
  assert.equal(isDeDocket('358, 2020'), true);
  assert.equal(isDeDocket('382, 2025'), true);
  assert.equal(isDeDocket('1, 2026'), true);
});

test('isDeDocket — accepts no-space comma form', () => {
  assert.equal(isDeDocket('382,2025'), true);
});

test('isDeDocket — accepts No. prefix', () => {
  assert.equal(isDeDocket('No. 28, 2019'), true);
  assert.equal(isDeDocket('No. 533, 2017'), true);
});

test('isDeDocket — strips <mark> tags', () => {
  assert.equal(isDeDocket('358, <mark>2020</mark>'), true);
});

test('isDeDocket — rejects non-DE forms', () => {
  assert.equal(isDeDocket('PR 14-0078'), false);
  assert.equal(isDeDocket('SC22-0001'), false);
  assert.equal(isDeDocket('2025-0331-M.P.'), false);
  assert.equal(isDeDocket(''), false);
  assert.equal(isDeDocket(null), false);
});

test('normalizeDeDocket — strips No. prefix + normalizes whitespace', () => {
  assert.equal(normalizeDeDocket('No. 28, 2019'), '28,2019');
  assert.equal(normalizeDeDocket('358, 2020'), '358,2020');
  assert.equal(normalizeDeDocket('382,2025'), '382,2025');
});

test('normalizeDeDocket — strips <mark> tags', () => {
  assert.equal(normalizeDeDocket('358, <mark>2020</mark>'), '358,2020');
});

test('normalizeDiscipline — sanction type mapping', () => {
  assert.equal(normalizeDiscipline('disbarred').type, 'disbarment');
  assert.equal(normalizeDiscipline('public reprimand').type, 'public_reprimand');
  assert.equal(normalizeDiscipline('admonition').type, 'admonition');
});

test('buildRecordFromClResult — builds full record', () => {
  const r = {
    docketNumber: '358, 2020',
    caseName: 'In the Matter of a Member of the Bar: Matthew M. Carucci',
    dateFiled: '2020-11-09',
    absolute_url: '/opinion/9999999/imo-bar-carucci/',
    opinions: [{ snippet: 'The respondent is suspended from the practice of law for two years.' }],
  };
  const rec = buildRecordFromClResult(r, 'suspension');
  assert.ok(rec);
  assert.equal(rec.bar_number, 'DESC:358,2020');
  assert.equal(rec.full_name, 'Matthew M. Carucci');
  assert.equal(rec.discipline_type, 'suspension');
});

test('buildRecordFromClResult — rejects anonymous DE caption', () => {
  const r = {
    docketNumber: '422, 2025',
    caseName: 'In the Matter of a Member of the Bar of the Supreme Court of the State of Delaware',
    dateFiled: '2025-10-09',
    absolute_url: '/opinion/x/',
  };
  assert.equal(buildRecordFromClResult(r, 'suspension'), null);
});

test('buildRecordFromClResult — accepts In re <Name>', () => {
  const r = {
    docketNumber: 'No. 28, 2019',
    caseName: 'In re Hornbeck',
    dateFiled: '2019-01-23',
    absolute_url: '/opinion/x/',
    opinions: [{ snippet: 'public reprimand for violation of Rules' }],
  };
  const rec = buildRecordFromClResult(r, 'public_reprimand');
  assert.ok(rec);
  assert.equal(rec.full_name, 'Hornbeck');
  assert.equal(rec.bar_number, 'DESC:28,2019');
});

test('buildRecordFromClResult — rejects unknown sanction', () => {
  const r = {
    docketNumber: '358, 2020',
    caseName: 'In the Matter of a Member of the Bar: Matthew M. Carucci',
    dateFiled: '2020-11-09',
    absolute_url: '/opinion/x/',
  };
  assert.equal(buildRecordFromClResult(r, 'unknown'), null);
});

test('ALLOWED_DISCIPLINE_TYPES includes canonical set', () => {
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('suspension'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('public_reprimand'));
});
