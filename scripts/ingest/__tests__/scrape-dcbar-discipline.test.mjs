import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isDcDocket,
  buildRecordFromClResult,
  ALLOWED_DISCIPLINE_TYPES,
} from '../scrape-dcbar-discipline.mjs';

test('parseCaseName accepts canonical "In re <Name>"', () => {
  assert.equal(parseCaseName('In re Brammer').fullName, 'Brammer');
  assert.equal(parseCaseName('In re Payne').fullName, 'Payne');
  assert.equal(parseCaseName('In re Larson-Jackson').fullName, 'Larson-Jackson');
});

test('parseCaseName strips trailing III', () => {
  assert.equal(parseCaseName('In re Lopatto, III').fullName, 'Lopatto');
});

test('parseCaseName preserves "IV" if attached without comma', () => {
  // "Crane IV" has IV as part of the literal name presentation.
  // Per spec we strip ", IV" only with comma — bare "Crane IV" stays.
  assert.equal(parseCaseName('In re Crane IV').fullName, 'Crane IV');
});

test('parseCaseName REJECTS "In re Estate of"', () => {
  assert.equal(parseCaseName('In re Estate of Smith').fullName, null);
});

test('parseCaseName REJECTS "In re Sealed Case"', () => {
  assert.equal(parseCaseName('In re Sealed Case').fullName, null);
});

test('parseCaseName REJECTS "In re Petition of <X>"', () => {
  assert.equal(parseCaseName('In re Petition of Doe').fullName, null);
});

test('parseCaseName REJECTS corporate captions', () => {
  assert.equal(parseCaseName('In re Smith LLC').fullName, null);
});

test('isDcDocket accepts NN-BG-NNNN', () => {
  assert.equal(isDcDocket('26-BG-0127'), true);
  assert.equal(isDcDocket('25-BG-0333'), true);
  assert.equal(isDcDocket('22-BG-0565'), true);
});

test('isDcDocket REJECTS non-BG dockets', () => {
  assert.equal(isDcDocket('26-CA-0127'), false);
  assert.equal(isDcDocket('20250115'), false);
  assert.equal(isDcDocket(''), false);
});

test('buildRecordFromClResult builds canonical event', () => {
  const r = {
    caseName: 'In re Brammer',
    docketNumber: '26-BG-0127',
    dateFiled: '2026-04-23',
    absolute_url: '/opinion/abc/in-re-brammer/',
    opinions: [{ snippet: 'disbarred from the Bar of the District of Columbia.' }],
  };
  const rec = buildRecordFromClResult(r, 'disbarment');
  assert.equal(rec.bar_number, 'DC:26-BG-0127');
  assert.equal(rec.full_name, 'Brammer');
  assert.equal(rec.discipline_type, 'disbarment');
});

test('buildRecordFromClResult REJECTS non-BG dockets', () => {
  const r = {
    caseName: 'In re Smith',
    docketNumber: '26-CA-0127',
    dateFiled: '2026-01-01',
    absolute_url: '/x/',
    opinions: [{ snippet: 'civil' }],
  };
  assert.equal(buildRecordFromClResult(r, 'disbarment'), null);
});

test('ALLOWED_DISCIPLINE_TYPES contains expected enum', () => {
  assert.equal(ALLOWED_DISCIPLINE_TYPES.has('disbarment'), true);
});
