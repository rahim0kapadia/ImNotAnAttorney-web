import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  normalizeVtDocket,
  isVtDocket,
  buildRecordFromClResult,
  ALLOWED_DISCIPLINE_TYPES,
} from '../scrape-vtbar-discipline.mjs';

test('parseCaseName accepts "In Re <Name> (Office of Disciplinary Counsel)"', () => {
  assert.equal(
    parseCaseName('In Re Matthew Ragaller (Office of Disciplinary Counsel, Appellant)').fullName,
    'Matthew Ragaller',
  );
  assert.equal(
    parseCaseName('In Re Norman E. Watts, Esq. (Office of Disciplinary Counsel)').fullName,
    'Norman E. Watts',
  );
});

test('parseCaseName accepts multi-caption form', () => {
  assert.equal(
    parseCaseName('In re Theodore Studdert-Kennedy / In re PRB-021-2022 (Office of Disciplinary Counsel)').fullName,
    'Theodore Studdert-Kennedy',
  );
});

test('parseCaseName accepts "In Re <Name>, Esq." (no parenthetical)', () => {
  assert.equal(
    parseCaseName('In Re C. Robert Manby, Jr., Esq.').fullName,
    'C. Robert Manby',
  );
  assert.equal(
    parseCaseName('In Re Melvin Fink, Esq.').fullName,
    'Melvin Fink',
  );
});

test('parseCaseName accepts bare "In Re <Name>" (PRB-context anchored at search level)', () => {
  // VT/PRB has many bare-caption discipline orders; the search anchor is
  // the gatekeeper, parser shouldn't reject these.
  assert.equal(parseCaseName('In Re George Henry Spangler').fullName, 'George Henry Spangler');
});

test('parseCaseName REJECTS corporate "In Re <Co> LLC"', () => {
  assert.equal(parseCaseName('In Re Holland Cannabis, LLC').fullName, null);
});

test('parseCaseName REJECTS "In Re Estate of"', () => {
  assert.equal(parseCaseName('In Re Estate of Smith').fullName, null);
});

test('parseCaseName REJECTS PRB-only refs', () => {
  assert.equal(parseCaseName('In re PRB-021-2022').fullName, null);
});

test('normalizeVtDocket accepts modern NN-AP-NNN', () => {
  assert.equal(normalizeVtDocket('25-AP-019'), '25-AP-019');
  assert.equal(normalizeVtDocket('22-AP-265'), '22-AP-265');
});

test('normalizeVtDocket accepts multi-docket and returns first', () => {
  assert.equal(normalizeVtDocket('23-AP-263, 23-AP-264'), '23-AP-263');
});

test('normalizeVtDocket accepts legacy YYYY-NNN', () => {
  assert.equal(normalizeVtDocket('2021-080'), '2021-080');
});

test('normalizeVtDocket rejects malformed', () => {
  assert.equal(normalizeVtDocket('XYZ'), null);
  assert.equal(normalizeVtDocket(''), null);
});

test('isVtDocket boolean wrapper', () => {
  assert.equal(isVtDocket('25-AP-019'), true);
  assert.equal(isVtDocket('2021-080'), true);
  assert.equal(isVtDocket('XYZ'), false);
});

test('buildRecordFromClResult builds canonical event', () => {
  const r = {
    caseName: 'In Re Matthew Ragaller (Office of Disciplinary Counsel, Appellant)',
    docketNumber: '25-AP-019',
    dateFiled: '2025-03-14',
    absolute_url: '/opinion/10356508/in-re-matthew-ragaller-office-of-disciplinary-counsel-appellant/',
    opinions: [{ snippet: 'suspended from the practice of law for two years.' }],
  };
  const rec = buildRecordFromClResult(r, 'suspension');
  assert.equal(rec.bar_number, 'VT:25-AP-019');
  assert.equal(rec.full_name, 'Matthew Ragaller');
  assert.equal(rec.discipline_type, 'suspension');
});

test('buildRecordFromClResult uses legacy docket', () => {
  const r = {
    caseName: 'In re William Tracy Carris, Esq. (Office of Disciplinary Counsel)',
    docketNumber: '2021-080',
    dateFiled: '2022-01-01',
    absolute_url: '/opinion/x/in-re-carris/',
    opinions: [{ snippet: 'suspension' }],
  };
  const rec = buildRecordFromClResult(r, 'suspension');
  assert.equal(rec.bar_number, 'VT:2021-080');
  assert.equal(rec.full_name, 'William Tracy Carris');
});

test('ALLOWED_DISCIPLINE_TYPES contains expected enum', () => {
  assert.equal(ALLOWED_DISCIPLINE_TYPES.has('disbarment'), true);
});
