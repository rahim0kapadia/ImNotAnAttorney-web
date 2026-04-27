// Template: scripts/ingest/__tests__/scrape-okbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-nebar-discipline.mjs
// No network, no DB. Exercises parsing logic with synthetic CL JSON results.
//
// Anti-TN-bug guard: fixtures derived from VERIFIED LIVE CL responses
// captured 2026-04-27 in scripts/ingest/__fixtures__/ne-cl-sample.json.
//
// Usage: node --test scripts/ingest/__tests__/scrape-nebar-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isNeDocket,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-nebar-discipline.mjs';

// ── isNeDocket ──────────────────────────────────────────────────────────────

test('isNeDocket accepts S-NN-NNN', () => {
  assert.ok(isNeDocket('S-24-166'));
  assert.ok(isNeDocket('S-21-832'));
});

test('isNeDocket accepts S-NN-NNNN', () => {
  assert.ok(isNeDocket('S-21-0686'));
});

test('isNeDocket strips trailing period', () => {
  assert.ok(isNeDocket('S-19-226.'));
});

test('isNeDocket rejects non-S dockets', () => {
  assert.equal(isNeDocket('SCBD-7480'), false);
  assert.equal(isNeDocket('128007'), false);
});

test('isNeDocket rejects empty / null', () => {
  assert.equal(isNeDocket(''), false);
  assert.equal(isNeDocket(null), false);
});

// ── parseCaseName ───────────────────────────────────────────────────────────

test('parseCaseName accepts canonical "State ex rel. Counsel for Dis. v. Glass"', () => {
  const r = parseCaseName('State ex rel. Counsel for Dis. v. Glass');
  assert.equal(r.fullName, 'Glass');
});

test('parseCaseName accepts typo "State ex re. Counsel for Dis. v. Gage"', () => {
  const r = parseCaseName('State ex re. Counsel for Dis. v. Gage');
  assert.equal(r.fullName, 'Gage');
});

test('parseCaseName accepts long form "Counsel for Discipline of the Nebraska Supreme Court v. Schmidt"', () => {
  const r = parseCaseName('State Ex Rel. Counsel for Discipline of the Nebraska Supreme Court v. Schmidt');
  assert.equal(r.fullName, 'Schmidt');
});

test('parseCaseName strips series suffix (II)', () => {
  const r = parseCaseName('State ex rel. Counsel for Dis. v. Kratina (II)');
  assert.equal(r.fullName, 'Kratina');
});

test('parseCaseName strips Jr. suffix', () => {
  const r = parseCaseName('State ex rel. Counsel for Dis. v. Smith, Jr.');
  assert.equal(r.fullName, 'Smith');
});

test('parseCaseName rejects "State v. Smith" (criminal)', () => {
  const r = parseCaseName('State v. Smith');
  assert.equal(r.fullName, null);
});

test('parseCaseName rejects "<Name> v. State"', () => {
  const r = parseCaseName('Smith v. State');
  assert.equal(r.fullName, null);
});

test('parseCaseName strips <mark> tags', () => {
  const r = parseCaseName('State ex rel. <mark>Counsel for Discipline</mark> v. Glass');
  assert.equal(r.fullName, 'Glass');
});

// ── normalizeDiscipline ─────────────────────────────────────────────────────

test('normalizeDiscipline tags disbarment', () => {
  assert.equal(normalizeDiscipline('respondent shall be disbarred').type, 'disbarment');
});

test('normalizeDiscipline tags suspension', () => {
  assert.equal(normalizeDiscipline('respondent is suspended for two years').type, 'suspension');
});

test('normalizeDiscipline tags public reprimand', () => {
  assert.equal(normalizeDiscipline('a public reprimand is imposed').type, 'public_reprimand');
});

// ── buildRecordFromClResult ─────────────────────────────────────────────────

test('buildRecordFromClResult accepts canonical NE caption', () => {
  const sample = {
    caseName: 'State ex rel. Counsel for Dis. v. Glass',
    docketNumber: 'S-24-166',
    dateFiled: '2025-10-24',
    absolute_url: '/opinion/9999999/state-ex-rel-counsel-for-dis-v-glass/',
    snippet: '',
    opinions: [{ snippet: 'State of Nebraska ex rel. Counsel for Discipline of the Nebraska Supreme Court, relator, v. Oliver Glass, respondent. Respondent is hereby disbarred.' }],
  };
  const r = buildRecordFromClResult(sample, 'disbarment');
  assert.ok(r);
  assert.equal(r.bar_number, 'NE:S-24-166');
  assert.equal(r.full_name, 'Glass');
  assert.equal(r.discipline_type, 'disbarment');
  assert.equal(r.order_date, '2025-10-24');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/opinion/'));
});

test('buildRecordFromClResult strips trailing period from docket', () => {
  const sample = {
    caseName: 'State ex rel. Counsel for Dis. v. Schmidt',
    docketNumber: 'S-19-226.',
    dateFiled: '2019-07-19',
    absolute_url: '/opinion/x/',
    opinions: [{ snippet: 'suspended for one year' }],
  };
  const r = buildRecordFromClResult(sample, 'suspension');
  assert.ok(r);
  assert.equal(r.bar_number, 'NE:S-19-226');
});

test('buildRecordFromClResult rejects non-discipline caption', () => {
  const sample = {
    caseName: 'State v. Smith',
    docketNumber: 'S-24-100',
    dateFiled: '2024-01-01',
    absolute_url: '/opinion/x/',
    opinions: [{ snippet: 'criminal sentence suspended' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'suspension'), null);
});

test('buildRecordFromClResult requires absolute_url', () => {
  const sample = {
    caseName: 'State ex rel. Counsel for Dis. v. Smith',
    docketNumber: 'S-24-100',
    dateFiled: '2024-01-01',
    absolute_url: null,
    opinions: [{ snippet: 'disbarred' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'disbarment'), null);
});

test('ALLOWED_DISCIPLINE_TYPES contains expected enum values', () => {
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('censure'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('probation'));
});
