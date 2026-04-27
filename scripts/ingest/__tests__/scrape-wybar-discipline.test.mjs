import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isWyDocket,
  buildRecordFromClResult,
  ALLOWED_DISCIPLINE_TYPES,
} from '../scrape-wybar-discipline.mjs';

test('parseCaseName accepts canonical caption with WSB number', () => {
  const r = parseCaseName(
    'Board of Professional Responsibility, Wyoming State Bar v. Kent C. Cobb, Wsb 8-6998',
  );
  assert.equal(r.fullName, 'Kent C. Cobb');
  assert.equal(r.wsb, '8-6998');
});

test('parseCaseName accepts caption without WSB number', () => {
  const r = parseCaseName(
    'Board of Professional Responsibility, Wyoming State Bar v. Jane Smith',
  );
  assert.equal(r.fullName, 'Jane Smith');
  assert.equal(r.wsb, null);
});

test('parseCaseName extracts WSB-formatted variants', () => {
  const r = parseCaseName(
    'Board of Professional Responsibility, Wyoming State Bar v. Vaughn H. Neubauer, WSB 6-3443',
  );
  assert.equal(r.fullName, 'Vaughn H. Neubauer');
  assert.equal(r.wsb, '6-3443');
});

test('parseCaseName REJECTS criminal/civil captions', () => {
  assert.equal(
    parseCaseName('Aaron R. Maki v. The State of Wyoming').fullName,
    null,
  );
  assert.equal(
    parseCaseName('In the Matter of the Estate of Lloyd Haack, Deceased').fullName,
    null,
  );
});

test('parseCaseName strips <mark> highlights', () => {
  const r = parseCaseName(
    '<mark>Board of Professional Responsibility</mark>, <mark>Wyoming State Bar</mark> v. John Doe, Wsb 1-1234',
  );
  assert.equal(r.fullName, 'John Doe');
  assert.equal(r.wsb, '1-1234');
});

test('isWyDocket accepts D-NN-NNNN', () => {
  assert.equal(isWyDocket('D-26-0001'), true);
  assert.equal(isWyDocket('D-22-0004'), true);
  assert.equal(isWyDocket('D-19-0001'), true);
});

test('isWyDocket rejects non-discipline (S-) docket', () => {
  assert.equal(isWyDocket('S-25-0166'), false);
});

test('isWyDocket rejects malformed', () => {
  assert.equal(isWyDocket(''), false);
  assert.equal(isWyDocket(null), false);
});

test('buildRecordFromClResult prefers WSB-derived bar_number', () => {
  const r = {
    caseName: 'Board of Professional Responsibility, Wyoming State Bar v. Kent C. Cobb, Wsb 8-6998',
    docketNumber: 'D-26-0001',
    dateFiled: '2026-04-08',
    absolute_url: '/opinion/x/board-of-professional-responsibility-wyoming-state-bar-v-kent-c-cobb/',
    opinions: [{ snippet: 'order of disbarment.' }],
  };
  const rec = buildRecordFromClResult(r, 'disbarment');
  assert.equal(rec.bar_number, 'WY:WSB-8-6998');
  assert.equal(rec.full_name, 'Kent C. Cobb');
});

test('buildRecordFromClResult falls back to docket-based bar_number when WSB absent', () => {
  const r = {
    caseName: 'Board of Professional Responsibility, Wyoming State Bar v. Jane Smith',
    docketNumber: 'D-25-0010',
    dateFiled: '2025-06-01',
    absolute_url: '/opinion/x/x/',
    opinions: [{ snippet: 'suspension' }],
  };
  const rec = buildRecordFromClResult(r, 'suspension');
  assert.equal(rec.bar_number, 'WY:D-25-0010');
});

test('buildRecordFromClResult REJECTS non-discipline docket', () => {
  const r = {
    caseName: 'Board of Professional Responsibility, Wyoming State Bar v. X',
    docketNumber: 'S-25-0001',
    dateFiled: '2025-01-01',
    absolute_url: '/x/',
    opinions: [{ snippet: 'x' }],
  };
  assert.equal(buildRecordFromClResult(r, 'suspension'), null);
});

test('ALLOWED_DISCIPLINE_TYPES contains expected enum', () => {
  assert.equal(ALLOWED_DISCIPLINE_TYPES.has('disbarment'), true);
});
