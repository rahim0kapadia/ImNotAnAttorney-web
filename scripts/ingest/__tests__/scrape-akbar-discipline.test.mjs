import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  normalizeAkDocket,
  isAkDocket,
  buildRecordFromClResult,
  ALLOWED_DISCIPLINE_TYPES,
} from '../scrape-akbar-discipline.mjs';

test('parseCaseName accepts canonical AK caption', () => {
  assert.equal(
    parseCaseName('In the Disciplinary Matter Involving Joshua M. Kindred').fullName,
    'Joshua M. Kindred',
  );
  assert.equal(
    parseCaseName('In the Disciplinary Matter Involving Nathan R. Michalski').fullName,
    'Nathan R. Michalski',
  );
});

test('parseCaseName strips trailing ", Attorney."', () => {
  assert.equal(
    parseCaseName('In the Disciplinary Matter Involving Ward M. Merdes, Attorney.').fullName,
    'Ward M. Merdes',
  );
});

test('parseCaseName strips leading "Attorney " in name', () => {
  assert.equal(
    parseCaseName('In the Disciplinary Matter Involving Attorney Gayle Brown').fullName,
    'Gayle Brown',
  );
  assert.equal(
    parseCaseName('In the Disciplinary Matter Involving Attorney Paul D. Stockler').fullName,
    'Paul D. Stockler',
  );
});

test('parseCaseName REJECTS judicial-discipline (Honorable / Judge / Magistrate)', () => {
  assert.equal(
    parseCaseName('In the Disciplinary Matter Involving Honorable Martin C. Fallon, District Court Judge').fullName,
    null,
  );
  assert.equal(
    parseCaseName('In the Disciplinary Matter Involving Hon. Mary Smith').fullName,
    null,
  );
  assert.equal(
    parseCaseName('In the Disciplinary Matter Involving Magistrate John Doe').fullName,
    null,
  );
});

test('parseCaseName REJECTS reinstatement petitions', () => {
  assert.equal(
    parseCaseName('In the Matter of the Petition for Reinstatement of Erin Pohland').fullName,
    null,
  );
});

test('parseCaseName accepts legacy "In re <Name>" form', () => {
  assert.equal(parseCaseName('In re Albertsen').fullName, 'Albertsen');
  assert.equal(parseCaseName('In re Vance').fullName, 'Vance');
});

test('parseCaseName REJECTS civil v. captions', () => {
  assert.equal(
    parseCaseName('Leroy Oenga, Jr. v. Maria M. Givens').fullName,
    null,
  );
});

test('normalizeAkDocket accepts modern "S19587"', () => {
  assert.equal(normalizeAkDocket('S19587'), 'S19587');
  assert.equal(normalizeAkDocket('S18006'), 'S18006');
});

test('normalizeAkDocket accepts legacy "Supreme Court No. S-NNNNN"', () => {
  assert.equal(normalizeAkDocket('Supreme Court No. S-17026'), 'S17026');
  assert.equal(normalizeAkDocket('Supreme Court No. S-16858'), 'S16858');
});

test('normalizeAkDocket accepts "S-17026" hyphen form', () => {
  assert.equal(normalizeAkDocket('S-17026'), 'S17026');
});

test('normalizeAkDocket rejects malformed', () => {
  assert.equal(normalizeAkDocket('A12345'), null);
  assert.equal(normalizeAkDocket(''), null);
});

test('isAkDocket boolean wrapper', () => {
  assert.equal(isAkDocket('S19587'), true);
  assert.equal(isAkDocket('Supreme Court No. S-17026'), true);
  assert.equal(isAkDocket('A12345'), false);
});

test('buildRecordFromClResult uses normalized docket in bar_number', () => {
  const r = {
    caseName: 'In the Disciplinary Matter Involving Joshua M. Kindred',
    docketNumber: 'S19587',
    dateFiled: '2025-11-07',
    absolute_url: '/opinion/10734996/in-the-disciplinary-matter-involving-joshua-m-kindred/',
    opinions: [{ snippet: 'suspended for two years.' }],
  };
  const rec = buildRecordFromClResult(r, 'suspension');
  assert.equal(rec.bar_number, 'AK:S19587');
  assert.equal(rec.full_name, 'Joshua M. Kindred');
});

test('buildRecordFromClResult uses normalized legacy docket', () => {
  const r = {
    caseName: 'In re Albertsen',
    docketNumber: 'Supreme Court No. S-17026',
    dateFiled: '2018-04-13',
    absolute_url: '/opinion/9999/in-re-albertsen/',
    opinions: [{ snippet: 'suspension' }],
  };
  const rec = buildRecordFromClResult(r, 'suspension');
  assert.equal(rec.bar_number, 'AK:S17026');
  assert.equal(rec.full_name, 'Albertsen');
});

test('buildRecordFromClResult REJECTS judicial discipline (Judge in name)', () => {
  const r = {
    caseName: 'In the Disciplinary Matter Involving Honorable Martin C. Fallon',
    docketNumber: 'S18873',
    dateFiled: '2024-03-08',
    absolute_url: '/opinion/x/x/',
    opinions: [{ snippet: 'judicial discipline' }],
  };
  assert.equal(buildRecordFromClResult(r, 'suspension'), null);
});

test('ALLOWED_DISCIPLINE_TYPES contains expected enum', () => {
  assert.equal(ALLOWED_DISCIPLINE_TYPES.has('disbarment'), true);
  assert.equal(ALLOWED_DISCIPLINE_TYPES.has('suspension'), true);
});
