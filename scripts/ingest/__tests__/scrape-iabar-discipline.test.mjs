// Template: scripts/ingest/__tests__/scrape-okbar-discipline.test.mjs
// Pattern: cl-bulk-data-defensive #18
// csv-bulk-checked: none-exists — self-contained unit test, synthetic fixtures
// test-isolation-na: read-only unit test, no Supabase writes
//
// Unit tests for scripts/ingest/scrape-iabar-discipline.mjs
// No network, no DB. Exercises parsing logic with synthetic CL JSON results.
//
// Anti-TN-bug guard: fixtures below are derived from VERIFIED LIVE CL responses
// captured 2026-04-27 (live-source URL probe). Caption shape, docketNumber with
// <mark> tags, opinions[0].snippet presence all match the live API.
//
// Usage: node --test scripts/ingest/__tests__/scrape-iabar-discipline.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCaseName,
  isIaDocket,
  normalizeDiscipline,
  ALLOWED_DISCIPLINE_TYPES,
  buildRecordFromClResult,
} from '../scrape-iabar-discipline.mjs';

// ── isIaDocket ──────────────────────────────────────────────────────────────

test('isIaDocket accepts YY-NNNN format', () => {
  assert.ok(isIaDocket('25-1787'));
  assert.ok(isIaDocket('23-0549'));
  assert.ok(isIaDocket('17-1415'));
});

test('isIaDocket accepts 3-digit case suffix', () => {
  assert.ok(isIaDocket('22-987'));
});

test('isIaDocket strips <mark> tags', () => {
  assert.ok(isIaDocket('<mark>23</mark>-0549'));
});

test('isIaDocket rejects empty / null / wrong format', () => {
  assert.equal(isIaDocket(''), false);
  assert.equal(isIaDocket(null), false);
  assert.equal(isIaDocket('SCBD-7480'), false);
  assert.equal(isIaDocket('1234567'), false);
  assert.equal(isIaDocket('25-12'), false); // too short
});

// ── parseCaseName ───────────────────────────────────────────────────────────

test('parseCaseName strips canonical Disciplinary Board prefix', () => {
  const r = parseCaseName(
    'Iowa Supreme Court Attorney Disciplinary Board v. Stephen K. Allison',
  );
  assert.equal(r.fullName, 'Stephen K. Allison');
});

test('parseCaseName strips <mark> wrapper from CL highlight=on', () => {
  const r = parseCaseName(
    '<mark>Iowa Supreme Court Attorney Disciplinary Board</mark> v. Carmen Eichmann',
  );
  assert.equal(r.fullName, 'Carmen Eichmann');
});

test('parseCaseName preserves multi-part names', () => {
  const r = parseCaseName(
    'Iowa Supreme Court Attorney Disciplinary Board v. Brien P. O\'Brien',
  );
  assert.equal(r.fullName, "Brien P. O'Brien");
});

test('parseCaseName rejects reversed caption (reinstatement appeal)', () => {
  const r = parseCaseName(
    'John Doe v. Iowa Supreme Court Attorney Disciplinary Board',
  );
  assert.equal(r.fullName, null);
});

test('parseCaseName rejects non-disciplinary captions', () => {
  const r = parseCaseName('State v. Smith');
  assert.equal(r.fullName, null);
});

test('parseCaseName strips trailing Esq./Bar No.', () => {
  const r = parseCaseName(
    'Iowa Supreme Court Attorney Disciplinary Board v. Patricia Jean Lipski, Esq.',
  );
  assert.equal(r.fullName, 'Patricia Jean Lipski');
});

test('parseCaseName normalizes ALL-CAPS names to Title-case', () => {
  const r = parseCaseName(
    'Iowa Supreme Court Attorney Disciplinary Board v. JOHN SMITH',
  );
  assert.equal(r.fullName, 'John Smith');
});

// ── normalizeDiscipline ─────────────────────────────────────────────────────

test('normalizeDiscipline maps disbarment terms', () => {
  assert.equal(normalizeDiscipline('attorney was disbarred').type, 'disbarment');
  assert.equal(normalizeDiscipline('license revocation').type, 'disbarment');
  assert.equal(normalizeDiscipline('license is revoked').type, 'disbarment');
});

test('normalizeDiscipline maps suspension', () => {
  assert.equal(normalizeDiscipline('suspended for 90 days').type, 'suspension');
  assert.equal(normalizeDiscipline('interim suspension').type, 'interim_suspension');
});

test('normalizeDiscipline maps surrender to resignation_with_charges', () => {
  assert.equal(
    normalizeDiscipline('voluntary surrender of license').type,
    'resignation_with_charges',
  );
});

test('normalizeDiscipline maps reprimand', () => {
  assert.equal(normalizeDiscipline('public reprimand issued').type, 'public_reprimand');
});

test('normalizeDiscipline returns unknown for non-discipline text', () => {
  assert.equal(normalizeDiscipline('this is unrelated text').type, 'unknown');
});

test('ALLOWED_DISCIPLINE_TYPES has expected size and contents', () => {
  assert.equal(ALLOWED_DISCIPLINE_TYPES.size, 10);
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('disbarment'));
  assert.ok(ALLOWED_DISCIPLINE_TYPES.has('reciprocal_discipline'));
});

// ── buildRecordFromClResult ─────────────────────────────────────────────────

const LIVE_RESULT = {
  caseName:
    '<mark>Iowa Supreme Court Attorney Disciplinary Board</mark> v. Stephen K. Allison',
  docketNumber: '25-1787',
  dateFiled: '2026-03-20',
  absolute_url:
    '/opinion/9999999/iowa-supreme-court-attorney-disciplinary-board-v-stephen-k-allison/',
  opinions: [
    { snippet: 'The respondent was suspended for 60 days following ...' },
  ],
};

test('buildRecordFromClResult builds full record from live shape', () => {
  const r = buildRecordFromClResult(LIVE_RESULT, 'suspension');
  assert.ok(r);
  assert.equal(r.bar_number, 'IA:25-1787');
  assert.equal(r.full_name, 'Stephen K. Allison');
  assert.equal(r.discipline_type, 'suspension');
  assert.equal(r.order_date, '2026-03-20');
  assert.ok(r.source_url.startsWith('https://www.courtlistener.com/'));
  assert.ok(r.source_url.endsWith(LIVE_RESULT.absolute_url));
});

test('buildRecordFromClResult skips non-IA dockets', () => {
  const r = buildRecordFromClResult(
    { ...LIVE_RESULT, docketNumber: 'SCBD-7480' },
    'suspension',
  );
  assert.equal(r, null);
});

test('buildRecordFromClResult skips reversed captions', () => {
  const r = buildRecordFromClResult(
    {
      ...LIVE_RESULT,
      caseName: 'John Doe v. Iowa Supreme Court Attorney Disciplinary Board',
    },
    'suspension',
  );
  assert.equal(r, null);
});

test('buildRecordFromClResult requires absolute_url for source_url', () => {
  const r = buildRecordFromClResult(
    { ...LIVE_RESULT, absolute_url: null },
    'suspension',
  );
  assert.equal(r, null);
});

test('buildRecordFromClResult rejects unknown sanction types', () => {
  const r = buildRecordFromClResult(LIVE_RESULT, 'made_up_sanction');
  assert.equal(r, null);
});

test('buildRecordFromClResult exposes discipline_raw and violation_summary', () => {
  const r = buildRecordFromClResult(LIVE_RESULT, 'suspension');
  assert.ok(r);
  assert.ok(r.discipline_raw && r.discipline_raw.length > 0);
  assert.ok(r.violation_summary && r.violation_summary.length > 0);
});

test('buildRecordFromClResult uses sanction type from caller (not snippet regex)', () => {
  // Even though snippet says "suspended", caller asserted reciprocal_discipline.
  const r = buildRecordFromClResult(LIVE_RESULT, 'reciprocal_discipline');
  assert.ok(r);
  assert.equal(r.discipline_type, 'reciprocal_discipline');
});
