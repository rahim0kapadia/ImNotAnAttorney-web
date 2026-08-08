// Template: scripts/ingest/__tests__/seed-statutes-va.test.mjs
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — synthetic HTML fixtures, no network
//
// Unit tests for CA Penal Code seed pipeline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCaSectionPage,
  isCaSectionNotFound,
  buildCaPenSourceUrl,
  buildCaPenFetchUrl,
  CA_PEN_DEFAULT_RANGES,
} from '../lib/ca-pen-html.mjs';
import {
  StatuteRowSchema,
  buildRow,
  parseCliFlags,
  textArrayLiteral,
  expandRanges,
  seedCA,
} from '../seed-statutes-ca-pen.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_187 = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'ca', 'pen-187-sample.html'),
  'utf-8',
);
const HTML_NOTFOUND = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'ca', 'pen-notfound-sample.html'),
  'utf-8',
);
// Section 21 is a real CA leginfo response: 200 OK, full page chrome, but
// <div id="single_law_section"></div> is EMPTY because § 21 doesn't exist
// (numbering gap). Captured 2026-05-02 from
// https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=21
const HTML_21_EMPTY = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'ca', 'pen-21-empty-section-sample.html'),
  'utf-8',
);

test('isCaSectionNotFound detects "could not be found" banner', () => {
  assert.equal(isCaSectionNotFound(HTML_NOTFOUND), true);
});

test('isCaSectionNotFound passes valid section page', () => {
  assert.equal(isCaSectionNotFound(HTML_187), false);
});

test('isCaSectionNotFound detects empty single_law_section div (numbering gap)', () => {
  // Regression for 2026-05-02: 169/670 candidate sections returned 200 with
  // empty <div id="single_law_section"></div>. Detector must treat as
  // not-found so seeder skips silently rather than rejecting as parse error.
  assert.equal(isCaSectionNotFound(HTML_21_EMPTY), true);
});

test('parseCaSectionPage returns null for empty single_law_section', () => {
  assert.equal(parseCaSectionPage(HTML_21_EMPTY, '21'), null);
});

test('parseCaSectionPage extracts statute body for §187', () => {
  const parsed = parseCaSectionPage(HTML_187, '187');
  assert.ok(parsed);
  assert.ok(parsed.bodyText.includes('Murder is the unlawful killing'));
  assert.ok(parsed.titleText.length > 0);
});

test('parseCaSectionPage skips history footer (Stats./Amended)', () => {
  const parsed = parseCaSectionPage(HTML_187, '187');
  assert.ok(parsed);
  // The "(Amended by Stats. 1996...)" history block must NOT leak into body
  assert.ok(!parsed.bodyText.includes('Amended by Stats. 1996'));
});

test('parseCaSectionPage returns null for not-found page', () => {
  assert.equal(parseCaSectionPage(HTML_NOTFOUND, '999999'), null);
});

test('parseCaSectionPage returns null when section anchor mismatched', () => {
  // Anchor in fixture is 187; asking for 188 → null
  const parsed = parseCaSectionPage(HTML_187, '188');
  assert.equal(parsed, null);
});

test('buildCaPenSourceUrl uses leginfo.legislature.ca.gov canonical URL', () => {
  const u = buildCaPenSourceUrl('187');
  assert.ok(u.startsWith('https://leginfo.legislature.ca.gov/'));
  assert.ok(u.includes('lawCode=PEN'));
  assert.ok(u.includes('sectionNum=187'));
});

test('buildCaPenFetchUrl alias matches source URL (same endpoint)', () => {
  assert.equal(buildCaPenFetchUrl('187'), buildCaPenSourceUrl('187'));
});

test('CA_PEN_DEFAULT_RANGES covers §187 (homicide)', () => {
  const expanded = expandRanges(CA_PEN_DEFAULT_RANGES);
  assert.ok(expanded.includes('187'));
});

test('expandRanges produces deduped string section numbers', () => {
  const expanded = expandRanges([{ from: 100, to: 105 }]);
  assert.deepEqual(expanded, ['100', '101', '102', '103', '104', '105']);
});

test('parseCliFlags handles --dry-run --limit', () => {
  const f = parseCliFlags(['--dry-run', '--limit=50']);
  assert.equal(f.dryRun, true);
  assert.equal(f.limit, 50);
});

test('buildRow + StatuteRowSchema accepts valid CA row', () => {
  const r = buildRow({
    section: '187',
    titleText: 'Homicide [187 - 199]',
    bodyText: 'Murder is the unlawful killing of a human being.',
    sourceUrl: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=187',
    scrapedAt: '2026-05-02T00:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.ok(check.success, JSON.stringify(check.error?.issues));
});

test('StatuteRowSchema rejects non-leginfo primary URL', () => {
  const r = buildRow({
    section: '187',
    titleText: 'H',
    bodyText: 'long enough body text to satisfy zod minimum',
    sourceUrl: 'https://law.justia.com/codes/california/2024/code-pen/187',
  });
  assert.equal(StatuteRowSchema.safeParse(r).success, false);
});

test('textArrayLiteral escapes CR/LF/quotes', () => {
  const lit = textArrayLiteral(['a"b\\c\nd\re']);
  assert.ok(!lit.includes('\n'));
  assert.ok(lit.includes('\\"'));
});

test('seedCA dry-run with sectionList override + fetch-fixture wires pipeline', async () => {
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('sectionNum=187')) {
      return { ok: true, status: 200, async text() { return HTML_187; } };
    }
    return { ok: true, status: 200, async text() { return HTML_NOTFOUND; } };
  };
  const out = await seedCA({
    dryRun: true,
    sectionList: ['187', '999999'],
    fetchImpl,
  });
  assert.equal(out.rows.length, 1, 'expected 1 row (187 only)');
  const r = out.rows[0];
  assert.equal(r.section, '187');
  assert.equal(r.jurisdiction, 'CA');
  assert.ok(r.source_urls[0].includes('leginfo.legislature.ca.gov'));
});
