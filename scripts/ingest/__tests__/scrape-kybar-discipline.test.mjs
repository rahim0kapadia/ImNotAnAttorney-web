import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isKyDocket,
  buildRecordFromClResult,
  ALLOWED_DISCIPLINE_TYPES,
  normalizeDiscipline,
} from '../scrape-kybar-discipline.mjs';

test('parseCaseName accepts forward "Kentucky Bar Ass\'n v. <Name>"', () => {
  assert.equal(parseCaseName("Kentucky Bar Ass'n v. McKeever").fullName, 'McKeever');
  assert.equal(parseCaseName("Kentucky Bar Ass'n v. Legg").fullName, 'Legg');
});

test('parseCaseName accepts forward expanded "Kentucky Bar Association v. <Name>"', () => {
  assert.equal(
    parseCaseName('Kentucky Bar Association v. Daniel Alan Niehaus').fullName,
    'Daniel Alan Niehaus'
  );
});

test('parseCaseName accepts reverse "<Name> v. Kentucky Bar Ass\'n"', () => {
  assert.equal(parseCaseName("Hoff v. Kentucky Bar Ass'n").fullName, 'Hoff');
  assert.equal(parseCaseName("Roberts v. Kentucky Bar Ass'n").fullName, 'Roberts');
  assert.equal(parseCaseName("Greene v. Kentucky Bar Ass'n").fullName, 'Greene');
});

test('parseCaseName rejects "Kentucky Bar Ass\'n v. Unnamed Attorney"', () => {
  assert.equal(parseCaseName("Kentucky Bar Ass'n v. Unnamed Attorney").fullName, null);
});

test('parseCaseName rejects unrelated impeachment caption', () => {
  assert.equal(
    parseCaseName('Julie Muth Goodman v. Jason Nemes, in His Official Capacity as Chair').fullName,
    null
  );
});

test('parseCaseName strips Jr./Sr./III suffixes', () => {
  assert.equal(parseCaseName("Kentucky Bar Ass'n v. Smith, Jr.").fullName, 'Smith');
  assert.equal(parseCaseName("Kentucky Bar Ass'n v. Smith, III").fullName, 'Smith');
});

test('parseCaseName strips <mark> highlights', () => {
  assert.equal(
    parseCaseName("<mark>Kentucky Bar Association</mark> v. Daniel Alan Niehaus").fullName,
    'Daniel Alan Niehaus'
  );
});

test('parseCaseName handles HTML entity for apostrophe', () => {
  assert.equal(parseCaseName("Kentucky Bar Ass&#x27;n v. Sparks").fullName, 'Sparks');
});

test('isKyDocket accepts -KB suffix', () => {
  assert.equal(isKyDocket('2017-SC-000560-KB'), true);
  assert.equal(isKyDocket('2014-SC-000300-KB'), true);
  assert.equal(isKyDocket('2018-SC-000013-KB'), true);
  assert.equal(isKyDocket('2017-SC-000560-kb'), true); // case-insensitive
});

test('isKyDocket rejects non-KB dockets', () => {
  assert.equal(isKyDocket('2017-SC-000560'), false);
  assert.equal(isKyDocket('2026-SC-0124'), false); // recent impeachment case
  assert.equal(isKyDocket('SCBD-1234'), false);
  assert.equal(isKyDocket(''), false);
  assert.equal(isKyDocket(null), false);
});

test('buildRecordFromClResult builds from valid forward CL result', () => {
  const r = {
    caseName: "Kentucky Bar Ass'n v. McKeever",
    docketNumber: '2017-SC-000560-KB',
    dateFiled: '2018-02-15',
    absolute_url: '/opinion/5449691/kentucky-bar-assn-v-mckeever/',
    opinions: [{ snippet: 'Suspended from the practice of law for 30 days.' }],
  };
  const rec = buildRecordFromClResult(r, 'suspension');
  assert.equal(rec.bar_number, 'KY:2017-SC-000560-KB');
  assert.equal(rec.full_name, 'McKeever');
  assert.equal(rec.discipline_type, 'suspension');
  assert.equal(rec.order_date, '2018-02-15');
  assert.equal(
    rec.source_url,
    'https://www.courtlistener.com/opinion/5449691/kentucky-bar-assn-v-mckeever/'
  );
});

test('buildRecordFromClResult builds from valid reverse CL result', () => {
  const r = {
    caseName: "Hoff v. Kentucky Bar Ass'n",
    docketNumber: '2018-SC-000013-KB',
    dateFiled: '2018-02-15',
    absolute_url: '/opinion/5449689/hoff-v-kentucky-bar-assn/',
    opinions: [{ snippet: 'Application for reinstatement granted.' }],
  };
  const rec = buildRecordFromClResult(r, 'reinstatement');
  assert.equal(rec.full_name, 'Hoff');
  assert.equal(rec.discipline_type, 'reinstatement');
});

test('buildRecordFromClResult returns null for non-KB docket (impeachment case)', () => {
  const r = {
    caseName:
      "Julie Muth Goodman v. Jason Nemes, in His Official Capacity as Chair of the House",
    docketNumber: '2026-SC-0124',
    dateFiled: '2026-04-06',
    absolute_url: '/opinion/9/x/',
    opinions: [{ snippet: 'irrelevant' }],
  };
  assert.equal(buildRecordFromClResult(r, 'suspension'), null);
});

test('buildRecordFromClResult returns null for "Unnamed Attorney"', () => {
  const r = {
    caseName: "Kentucky Bar Ass'n v. Unnamed Attorney",
    docketNumber: '2015-SC-000574-KB',
    dateFiled: '2015-12-17',
    absolute_url: '/opinion/5446147/kentucky-bar-assn-v-unnamed-attorney/',
    opinions: [{ snippet: 'private reprimand' }],
  };
  assert.equal(buildRecordFromClResult(r, 'admonition'), null);
});

test('buildRecordFromClResult returns null without absolute_url (never fabricate)', () => {
  const r = {
    caseName: "Kentucky Bar Ass'n v. X",
    docketNumber: '2019-SC-000001-KB',
    dateFiled: '2019-01-01',
    absolute_url: null,
    opinions: [{ snippet: 'x' }],
  };
  assert.equal(buildRecordFromClResult(r, 'suspension'), null);
});

test('ALLOWED_DISCIPLINE_TYPES contains expected enum values', () => {
  for (const t of [
    'disbarment',
    'suspension',
    'interim_suspension',
    'probation',
    'public_reprimand',
    'resignation_with_charges',
    'admonition',
    'reciprocal_discipline',
    'disability_inactive',
    'reinstatement',
  ]) {
    assert.equal(ALLOWED_DISCIPLINE_TYPES.has(t), true, t);
  }
});

test('normalizeDiscipline matches expected sanction', () => {
  assert.equal(normalizeDiscipline('order of disbarment').type, 'disbarment');
  assert.equal(normalizeDiscipline('suspended for two years').type, 'suspension');
  assert.equal(normalizeDiscipline('publicly reprimanded').type, 'public_reprimand');
  assert.equal(normalizeDiscipline('reinstatement granted').type, 'reinstatement');
  assert.equal(normalizeDiscipline('reciprocal discipline').type, 'reciprocal_discipline');
  assert.equal(normalizeDiscipline('').type, 'unknown');
});
