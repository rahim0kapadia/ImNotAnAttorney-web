import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  normalizeFederalDocket,
  buildRecordFromClResult,
  inferCircuit,
  ALLOWED_DISCIPLINE_TYPES,
  normalizeDiscipline,
} from '../scrape-federalbar-discipline.mjs';

test('parseCaseName accepts canonical "In Re <Name>"', () => {
  assert.equal(parseCaseName('In Re Andres M. Aranda').fullName, 'Andres M. Aranda');
  assert.equal(parseCaseName('In re Bernfeld').fullName, 'Bernfeld');
  assert.equal(parseCaseName('In Re Peter S. Gordon').fullName, 'Peter S. Gordon');
});

test('parseCaseName accepts "Matter Of <Name>"', () => {
  assert.equal(parseCaseName('Matter Of Cooper').fullName, 'Cooper');
});

test('parseCaseName accepts "In Re: <Name>" (with colon)', () => {
  assert.equal(parseCaseName('In Re: Uzmah Saghir').fullName, 'Uzmah Saghir');
});

test('parseCaseName rejects "[Redacted], Attorneys."', () => {
  assert.equal(parseCaseName('In Re: [Redacted], Attorneys.').fullName, null);
});

test('parseCaseName rejects "Attorney Disciplinary Appeal"', () => {
  assert.equal(parseCaseName('In Re Attorney Disciplinary Appeal').fullName, null);
});

test('parseCaseName rejects rules / process captions', () => {
  assert.equal(parseCaseName('In Re the Rules of Professional Conduct').fullName, null);
  assert.equal(parseCaseName('In Re Application for Admission').fullName, null);
});

test('parseCaseName strips Jr./III suffixes', () => {
  assert.equal(parseCaseName('In Re Smith, Jr.').fullName, 'Smith');
  assert.equal(parseCaseName('In Re Smith, III').fullName, 'Smith');
});

test('parseCaseName strips trailing ", Attorneys."', () => {
  assert.equal(parseCaseName('In Re Doe, Attorneys.').fullName, 'Doe');
});

test('normalizeFederalDocket accepts canonical -am dockets', () => {
  assert.equal(normalizeFederalDocket('14-90027-am'), '14-90027-am');
  assert.equal(normalizeFederalDocket('07-9056-am'), '07-9056-am');
  assert.equal(normalizeFederalDocket('09-90133-AM'), '09-90133-AM');
});

test('normalizeFederalDocket strips "Docket" / "No." prefix', () => {
  assert.equal(normalizeFederalDocket('Docket 11-90055-am'), '11-90055-am');
  assert.equal(normalizeFederalDocket('No. 14-90080-am'), '14-90080-am');
});

test('normalizeFederalDocket normalizes multi-docket to first', () => {
  assert.equal(
    normalizeFederalDocket('08-9002-am, 07-9064-am'),
    '08-9002-am'
  );
});

test('normalizeFederalDocket strips <mark> highlights', () => {
  assert.equal(normalizeFederalDocket('<mark>14-90027-am</mark>'), '14-90027-am');
});

test('normalizeFederalDocket rejects non-am dockets', () => {
  assert.equal(normalizeFederalDocket('21-1058'), null);
  assert.equal(normalizeFederalDocket('25-5391'), null);
  assert.equal(normalizeFederalDocket('14-MA004'), null);
  assert.equal(normalizeFederalDocket(''), null);
  assert.equal(normalizeFederalDocket(null), null);
});

test('inferCircuit maps verbose CL court field to short code', () => {
  assert.equal(inferCircuit({ court: 'Court of Appeals for the Second Circuit' }), 'ca2');
  assert.equal(inferCircuit({ court: 'Court of Appeals for the Ninth Circuit' }), 'ca9');
  assert.equal(inferCircuit({ court: 'Court of Appeals for the Eleventh Circuit' }), 'ca11');
  assert.equal(inferCircuit({ court: 'Court of Appeals for the D.C. Circuit' }), 'cadc');
  assert.equal(inferCircuit({ court: 'Court of Appeals for the Federal Circuit' }), 'cafc');
});

test('inferCircuit returns null for missing or unknown court', () => {
  assert.equal(inferCircuit({}), null);
  assert.equal(inferCircuit({ court: 'Unknown Court' }), null);
});

test('buildRecordFromClResult builds from valid CA2 -am result', () => {
  const r = {
    caseName: 'In Re Andres M. Aranda',
    docketNumber: '14-90027-am',
    dateFiled: '2015-05-22',
    absolute_url: '/opinion/2802935/in-re-andres-m-aranda/',
    court: 'Court of Appeals for the Second Circuit',
    opinions: [{ snippet: 'Aranda is suspended from the practice of law before this Court.' }],
  };
  const rec = buildRecordFromClResult(r);
  assert.equal(rec.bar_number, 'US:ca2:14-90027-am');
  assert.equal(rec.full_name, 'Andres M. Aranda');
  assert.equal(rec.discipline_type, 'suspension');
  assert.equal(rec.order_date, '2015-05-22');
  assert.equal(
    rec.source_url,
    'https://www.courtlistener.com/opinion/2802935/in-re-andres-m-aranda/'
  );
});

test('buildRecordFromClResult classifies disbarment from snippet', () => {
  const r = {
    caseName: 'In Re Doe',
    docketNumber: '15-90001-am',
    dateFiled: '2016-01-01',
    absolute_url: '/opinion/9/in-re-doe/',
    court: 'Court of Appeals for the Second Circuit',
    opinions: [{ snippet: 'Doe is hereby disbarred from the bar of this Court.' }],
  };
  const rec = buildRecordFromClResult(r);
  assert.equal(rec.discipline_type, 'disbarment');
});

test('buildRecordFromClResult returns null for non-am docket', () => {
  const r = {
    caseName: 'In Re Smith',
    docketNumber: '21-1058',
    dateFiled: '2026-04-21',
    absolute_url: '/opinion/9/in-re-smith/',
    court: 'Court of Appeals for the Second Circuit',
    opinions: [{ snippet: 'criminal' }],
  };
  assert.equal(buildRecordFromClResult(r), null);
});

test('buildRecordFromClResult returns null for redacted caption', () => {
  const r = {
    caseName: 'In Re: [Redacted], Attorneys.',
    docketNumber: '16-90010-am',
    dateFiled: '2016-03-15',
    absolute_url: '/opinion/3185573/in-re-redacted-attorneys/',
    court: 'Court of Appeals for the Second Circuit',
    opinions: [{ snippet: 'discipline' }],
  };
  assert.equal(buildRecordFromClResult(r), null);
});

test('buildRecordFromClResult returns null without absolute_url (never fabricate)', () => {
  const r = {
    caseName: 'In Re Doe',
    docketNumber: '15-90001-am',
    dateFiled: '2016-01-01',
    absolute_url: null,
    court: 'Court of Appeals for the Second Circuit',
    opinions: [{ snippet: 'disbarred' }],
  };
  assert.equal(buildRecordFromClResult(r), null);
});

test('ALLOWED_DISCIPLINE_TYPES contains expected enum values', () => {
  for (const t of [
    'disbarment',
    'suspension',
    'interim_suspension',
    'probation',
    'public_reprimand',
    'resignation_with_charges',
    'censure',
    'admonition',
    'reciprocal_discipline',
    'disability_inactive',
    'unknown',
  ]) {
    assert.equal(ALLOWED_DISCIPLINE_TYPES.has(t), true, t);
  }
});

test('normalizeDiscipline matches expected federal sanction labels', () => {
  assert.equal(normalizeDiscipline('order of disbarment').type, 'disbarment');
  assert.equal(normalizeDiscipline('removed from the roll').type, 'disbarment');
  assert.equal(normalizeDiscipline('stricken from the bar').type, 'disbarment');
  assert.equal(normalizeDiscipline('suspended for two years').type, 'suspension');
  assert.equal(normalizeDiscipline('reciprocal discipline imposed').type, 'reciprocal_discipline');
});
