// Template: scripts/ingest/__tests__/seed-statutes-va.test.mjs
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — synthetic XML fixtures, no network
//
// Unit tests for DC Title 22 seed pipeline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractDcSectionRefs,
  parseDcSection,
  buildDcSourceUrl,
  buildDcRawUrl,
  DC_INDEX_URL,
} from '../lib/dc-title22-xml.mjs';
import {
  StatuteRowSchema,
  buildRow,
  parseCliFlags,
  textArrayLiteral,
  seedDC,
} from '../seed-statutes-dc-title22.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_FIXTURE = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'dc', 'title22-index-sample.xml'),
  'utf-8',
);
const SECTION_FIXTURE = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'dc', 'section-22-1001-sample.xml'),
  'utf-8',
);

test('extractDcSectionRefs lists all included section IDs', () => {
  const ids = extractDcSectionRefs(INDEX_FIXTURE);
  assert.deepEqual(ids.sort(), ['22-1001', '22-1002.01', '22-301', '22-302']);
});

test('extractDcSectionRefs deduplicates', () => {
  const dup = INDEX_FIXTURE + INDEX_FIXTURE;
  const ids = extractDcSectionRefs(dup);
  // Same 4 sections, deduped
  assert.equal(ids.length, 4);
});

test('extractDcSectionRefs returns [] for empty input', () => {
  assert.deepEqual(extractDcSectionRefs(''), []);
  assert.deepEqual(extractDcSectionRefs(null), []);
});

test('parseDcSection extracts heading and body, excludes annotations', () => {
  const parsed = parseDcSection(SECTION_FIXTURE, '22-1001');
  assert.ok(parsed);
  assert.equal(parsed.titleText, 'Definitions and penalties.');
  assert.ok(parsed.bodyText.includes('Whoever knowingly overdrives'));
  assert.ok(parsed.bodyText.includes('cruelly chains'));
  // Annotation history should NOT leak into bodyText
  assert.ok(!parsed.bodyText.includes('Aug. 23, 1871'));
  assert.ok(!parsed.bodyText.includes('1973 Ed.'));
});

test('parseDcSection returns null for tiny/empty input', () => {
  assert.equal(parseDcSection('', '22-1001'), null);
  assert.equal(parseDcSection('<x/>', '22-1001'), null);
});

test('buildDcSourceUrl uses code.dccouncil.gov canonical URL', () => {
  const u = buildDcSourceUrl('22-1001');
  assert.ok(u.startsWith('https://code.dccouncil.gov/'));
  assert.ok(u.includes('22-1001'));
});

test('buildDcRawUrl uses raw.githubusercontent.com', () => {
  const u = buildDcRawUrl('22-1001');
  assert.ok(u.startsWith('https://raw.githubusercontent.com/DCCouncil/law-xml/'));
  assert.ok(u.endsWith('22-1001.xml'));
});

test('DC_INDEX_URL points at law-xml master', () => {
  assert.ok(DC_INDEX_URL.startsWith('https://raw.githubusercontent.com/DCCouncil/law-xml/'));
  assert.ok(DC_INDEX_URL.endsWith('/index.xml'));
});

test('parseCliFlags handles --dry-run --verbose --limit', () => {
  const f = parseCliFlags(['--dry-run', '--verbose', '--limit=10']);
  assert.equal(f.dryRun, true);
  assert.equal(f.verbose, true);
  assert.equal(f.limit, 10);
});

test('buildRow + StatuteRowSchema accepts valid DC row', () => {
  const r = buildRow({
    section: '22-1001',
    titleText: 'Definitions and penalties.',
    bodyText: 'long enough body text to satisfy zod min length',
    sourceUrl: 'https://code.dccouncil.gov/us/dc/council/code/sections/22-1001.html',
    scrapedAt: '2026-05-02T00:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.ok(check.success, JSON.stringify(check.error?.issues));
});

test('StatuteRowSchema rejects non-DC primary URL host', () => {
  const r = buildRow({
    section: '22-1001',
    titleText: 'D',
    bodyText: 'long enough body text to satisfy zod minimum',
    sourceUrl: 'https://law.justia.com/codes/dc/2024/title-22/1001',
  });
  assert.equal(StatuteRowSchema.safeParse(r).success, false);
});

test('textArrayLiteral escapes CR/LF/quotes', () => {
  const lit = textArrayLiteral(['a"b\\c\nd\re']);
  assert.ok(!lit.includes('\n'));
  assert.ok(lit.includes('\\"'));
});

test('seedDC dry-run wires fetch-fixture pipeline end-to-end', async () => {
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.endsWith('/index.xml')) {
      return { ok: true, status: 200, async text() { return INDEX_FIXTURE; } };
    }
    if (u.endsWith('22-1001.xml') || u.endsWith('22-301.xml')
        || u.endsWith('22-302.xml') || u.endsWith('22-1002.01.xml')) {
      return { ok: true, status: 200, async text() { return SECTION_FIXTURE; } };
    }
    return { ok: false, status: 404, async text() { return ''; } };
  };
  const out = await seedDC({
    dryRun: true,
    verbose: false,
    fetchImpl,
  });
  assert.ok(out.rows.length > 0, 'expected rows, got ' + out.rows.length);
  for (const r of out.rows) {
    assert.equal(r.jurisdiction, 'DC');
    assert.equal(r.title, '22');
    assert.ok(r.source_urls[0].includes('code.dccouncil.gov'));
  }
});
