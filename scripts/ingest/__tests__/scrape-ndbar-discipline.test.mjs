import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  normalizeNdDocket,
  isNdDocket,
  buildRecordFromClResult,
  ALLOWED_DISCIPLINE_TYPES,
} from '../scrape-ndbar-discipline.mjs';

test('parseCaseName accepts "Disciplinary Board v. <Name>"', () => {
  assert.equal(parseCaseName('Disciplinary Board v. Merkens').fullName, 'Merkens');
  assert.equal(parseCaseName('Disciplinary Board v. Spencer').fullName, 'Spencer');
});

test('parseCaseName strips parenthetical stage labels', () => {
  assert.equal(
    parseCaseName('Disciplinary Board v. Spencer (Interim Suspension)').fullName,
    'Spencer',
  );
});

test('parseCaseName strips trailing ND citation', () => {
  assert.equal(
    parseCaseName('Disciplinary Board v. Spencer 2024 ND 28').fullName,
    'Spencer',
  );
  assert.equal(
    parseCaseName('Disciplinary Board v. Daniel 2024 ND 191').fullName,
    'Daniel',
  );
});

test('parseCaseName accepts "Reciprocal Discipline of <Name>"', () => {
  assert.equal(parseCaseName('Reciprocal Discipline of Odegaard').fullName, 'Odegaard');
  assert.equal(
    parseCaseName('Reciprocal Discipline of Odegaard 2025 ND 118').fullName,
    'Odegaard',
  );
});

test('parseCaseName rejects criminal/civil captions', () => {
  assert.equal(parseCaseName('State v. Cooper').fullName, null);
  assert.equal(parseCaseName('Bauer v. Adam').fullName, null);
});

test('parseCaseName strips <mark> highlights', () => {
  assert.equal(
    parseCaseName('<mark>Disciplinary Board</mark> v. Merkens').fullName,
    'Merkens',
  );
});

test('normalizeNdDocket accepts 8-digit numeric with No. prefix', () => {
  assert.equal(normalizeNdDocket('No. 20250115'), '20250115');
  assert.equal(normalizeNdDocket('20240339'), '20240339');
});

test('normalizeNdDocket accepts multi-docket range and returns first', () => {
  assert.equal(normalizeNdDocket('Nos. 20250300-20250302'), '20250300');
});

test('normalizeNdDocket strips <mark> highlights', () => {
  assert.equal(normalizeNdDocket('<mark>No.</mark> 20240182'), '20240182');
});

test('normalizeNdDocket rejects malformed', () => {
  assert.equal(normalizeNdDocket('XYZ'), null);
  assert.equal(normalizeNdDocket(''), null);
  assert.equal(normalizeNdDocket(null), null);
});

test('isNdDocket boolean wrapper', () => {
  assert.equal(isNdDocket('No. 20250115'), true);
  assert.equal(isNdDocket('XYZ'), false);
});

test('buildRecordFromClResult builds from canonical result', () => {
  const r = {
    caseName: 'Disciplinary Board v. Merkens',
    docketNumber: 'Nos. 20250300-20250302',
    dateFiled: '2025-09-22',
    absolute_url: '/opinion/10675457/disciplinary-board-v-merkens/',
    opinions: [{ snippet: 'Disciplinary Board notified. SUSPENSION ORDERED.' }],
  };
  const rec = buildRecordFromClResult(r, 'suspension');
  assert.equal(rec.bar_number, 'ND:20250300');
  assert.equal(rec.full_name, 'Merkens');
  assert.equal(rec.discipline_type, 'suspension');
});

test('buildRecordFromClResult returns null without absolute_url', () => {
  const r = {
    caseName: 'Disciplinary Board v. X',
    docketNumber: 'No. 20240001',
    dateFiled: '2024-01-01',
    absolute_url: null,
    opinions: [{ snippet: 'x' }],
  };
  assert.equal(buildRecordFromClResult(r, 'suspension'), null);
});

test('ALLOWED_DISCIPLINE_TYPES contains all enum values', () => {
  for (const t of ['disbarment', 'suspension', 'reciprocal_discipline']) {
    assert.equal(ALLOWED_DISCIPLINE_TYPES.has(t), true);
  }
});
