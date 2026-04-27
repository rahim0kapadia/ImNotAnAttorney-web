// Template: scripts/ingest/__tests__/scrape-okbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-ksbar-discipline.mjs
// No network, no DB. Exercises parsing logic with synthetic CL JSON results.
//
// Anti-TN-bug guard: fixtures derived from VERIFIED LIVE CL responses
// captured 2026-04-27 in scripts/ingest/__fixtures__/ks-cl-sample.json.
//
// Usage: node --test scripts/ingest/__tests__/scrape-ksbar-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isKsDocket,
  isReinstatementSnippet,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-ksbar-discipline.mjs';

// ── isKsDocket ──────────────────────────────────────────────────────────────

test('isKsDocket accepts bare 4-7 digit numeric', () => {
  assert.ok(isKsDocket('128007'));
  assert.ok(isKsDocket('12723'));
  assert.ok(isKsDocket('20346'));
});

test('isKsDocket rejects dashed dockets', () => {
  assert.equal(isKsDocket('SCBD-7480'), false);
  assert.equal(isKsDocket('S-24-166'), false);
});

test('isKsDocket rejects empty / null', () => {
  assert.equal(isKsDocket(''), false);
  assert.equal(isKsDocket(null), false);
});

// ── parseCaseName ───────────────────────────────────────────────────────────

test('parseCaseName accepts "In re Stewart"', () => {
  const r = parseCaseName('In re Stewart');
  assert.equal(r.fullName, 'Stewart');
});

test('parseCaseName strips generation suffix "Peterson, II"', () => {
  const r = parseCaseName('In re Peterson, II');
  assert.equal(r.fullName, 'Peterson');
});

test('parseCaseName strips Jr. suffix', () => {
  const r = parseCaseName('In re Smith, Jr.');
  assert.equal(r.fullName, 'Smith');
});

test('parseCaseName rejects "State v. Smith"', () => {
  const r = parseCaseName('State v. Smith');
  assert.equal(r.fullName, null);
});

test('parseCaseName rejects civil "Mercer v. Reynolds"', () => {
  const r = parseCaseName("Mercer v. Reynolds");
  assert.equal(r.fullName, null);
});

test('parseCaseName strips <mark> tags', () => {
  const r = parseCaseName('<mark>In re</mark> Stewart');
  assert.equal(r.fullName, 'Stewart');
});

// ── isReinstatementSnippet ──────────────────────────────────────────────────

test('isReinstatementSnippet detects top-of-snippet REINSTATEMENT', () => {
  assert.ok(isReinstatementSnippet('REINSTATEMENT\n\nOn April 21, 2023, the court suspended ...'));
});

test('isReinstatementSnippet detects "ORDER OF REINSTATEMENT"', () => {
  assert.ok(isReinstatementSnippet('  ORDER OF REINSTATEMENT'));
});

test('isReinstatementSnippet detects "Petition for Reinstatement"', () => {
  assert.ok(isReinstatementSnippet('  Petition for Reinstatement filed by ...'));
});

test('isReinstatementSnippet false on disbarment order', () => {
  assert.equal(isReinstatementSnippet('ORDER OF DISBARMENT'), false);
});

// ── normalizeDiscipline ─────────────────────────────────────────────────────

test('normalizeDiscipline tags disbarment', () => {
  assert.equal(normalizeDiscipline('respondent is hereby disbarred from the practice').type, 'disbarment');
});

test('normalizeDiscipline tags indefinite suspension as suspension', () => {
  assert.equal(normalizeDiscipline('the court indefinitely suspended respondent').type, 'suspension');
});

test('normalizeDiscipline tags censure', () => {
  assert.equal(normalizeDiscipline('respondent is hereby censured').type, 'censure');
});

// ── buildRecordFromClResult ─────────────────────────────────────────────────

test('buildRecordFromClResult accepts KS In re + Disciplinary Administrator + disbarment snippet', () => {
  const sample = {
    caseName: '<mark>In re</mark> Edwards',
    docketNumber: '12723',
    dateFiled: '2026-02-26',
    absolute_url: '/opinion/10810000/in-re-edwards/',
    snippet: '',
    opinions: [
      {
        snippet: 'Respondent.\n\n                               ORDER OF DISBARMENT\n\n       The court admitted respondent Carolyn',
      },
    ],
  };
  const r = buildRecordFromClResult(sample, 'disbarment');
  assert.ok(r);
  assert.equal(r.bar_number, 'KS:12723');
  assert.equal(r.full_name, 'Edwards');
  assert.equal(r.discipline_type, 'disbarment');
  assert.equal(r.order_date, '2026-02-26');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/opinion/'));
});

test('buildRecordFromClResult rejects reinstatement snippet', () => {
  const sample = {
    caseName: 'In re McVey',
    docketNumber: '125499',
    dateFiled: '2025-09-22',
    absolute_url: '/opinion/9999999/in-re-mcvey/',
    opinions: [{ snippet: 'REINSTATEMENT\n\nOn April 21, 2023, the court suspended Jeff Lee McVey&#x27;s Kansas law license' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'suspension'), null);
});

test('buildRecordFromClResult rejects "State v. X" caption', () => {
  const sample = {
    caseName: 'State v. Smith',
    docketNumber: '12345',
    dateFiled: '2024-01-01',
    absolute_url: '/opinion/x/',
    opinions: [{ snippet: 'criminal sentence suspended' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'suspension'), null);
});

test('buildRecordFromClResult requires absolute_url', () => {
  const sample = {
    caseName: 'In re Smith',
    docketNumber: '12345',
    dateFiled: '2024-01-01',
    absolute_url: null,
    opinions: [{ snippet: 'disbarred' }],
  };
  assert.equal(buildRecordFromClResult(sample, 'disbarment'), null);
});

test('buildRecordFromClResult unescapes &#x27; in snippet', () => {
  const sample = {
    caseName: 'In re Sullivan',
    docketNumber: '118723',
    dateFiled: '2025-09-22',
    absolute_url: '/opinion/x/',
    opinions: [{ snippet: 'On June 29, 2018, the court indefinitely suspended John Bernard Sullivan&#x27;s Kansas law license' }],
  };
  const r = buildRecordFromClResult(sample, 'suspension');
  assert.ok(r);
  assert.ok(r.discipline_raw.includes("Sullivan's"));
});

test('ALLOWED_DISCIPLINE_TYPES contains expected enum values', () => {
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('censure'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('probation'));
});
