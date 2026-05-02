// Template: scripts/ingest/__tests__/seed-statutes-va.test.mjs
// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// csv-bulk-checked: none-exists — synthetic text fixture (mimics pdf-parse output), no network
//
// Unit tests for WY Title 6 seed pipeline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseWyTitle06Text,
  buildWySourceUrl,
  WY_TITLE06_PDF_URL,
} from '../lib/wy-title06-pdf.mjs';
import {
  StatuteRowSchema,
  buildRow,
  parseCliFlags,
  textArrayLiteral,
  seedWY,
} from '../seed-statutes-wy-title06.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TXT_FIXTURE = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'wy', 'title06-sample.txt'),
  'utf-8',
);

test('parseWyTitle06Text extracts all section anchors', () => {
  const sections = parseWyTitle06Text(TXT_FIXTURE);
  // Fixture has 6 sections: 6-1-101, 6-1-102, 6-1-103, 6-2-101, 6-2-104, 6-3-301
  const ids = sections.map((s) => s.sectionNum).sort();
  assert.deepEqual(ids, ['6-1-101', '6-1-102', '6-1-103', '6-2-101', '6-2-104', '6-3-301']);
});

test('parseWyTitle06Text captures titleText (first-line continuation)', () => {
  const sections = parseWyTitle06Text(TXT_FIXTURE);
  const m = sections.find((s) => s.sectionNum === '6-1-101');
  assert.ok(m);
  assert.ok(m.titleText.includes('Title') || m.titleText.includes('effective'));
});

test('parseWyTitle06Text captures bodyText (multi-line block)', () => {
  const sections = parseWyTitle06Text(TXT_FIXTURE);
  const m = sections.find((s) => s.sectionNum === '6-2-101');
  assert.ok(m);
  assert.ok(m.bodyText.includes('purposely and with premeditated malice'));
});

test('parseWyTitle06Text computes chapterNum from middle component', () => {
  const sections = parseWyTitle06Text(TXT_FIXTURE);
  const m = sections.find((s) => s.sectionNum === '6-3-301');
  assert.equal(m.chapterNum, '3');
});

test('parseWyTitle06Text returns [] for empty input', () => {
  assert.deepEqual(parseWyTitle06Text(''), []);
  assert.deepEqual(parseWyTitle06Text(null), []);
});

test('parseWyTitle06Text rejects non-Title-6 anchors', () => {
  const noise = '7-1-101. Some other title.\nThis is not Title 6.\n';
  assert.deepEqual(parseWyTitle06Text(noise), []);
});

test('buildWySourceUrl uses wyoleg.gov canonical URL', () => {
  const u = buildWySourceUrl('6-2-101');
  assert.ok(u.startsWith('https://wyoleg.gov/statutes/compress/title06.pdf'));
  assert.ok(u.includes('6-2-101'));
});

test('WY_TITLE06_PDF_URL is HTTPS wyoleg.gov', () => {
  assert.ok(WY_TITLE06_PDF_URL.startsWith('https://wyoleg.gov/'));
});

test('parseCliFlags handles --dry-run --verbose --limit', () => {
  const f = parseCliFlags(['--dry-run', '--verbose', '--limit=20']);
  assert.equal(f.dryRun, true);
  assert.equal(f.verbose, true);
  assert.equal(f.limit, 20);
});

test('buildRow + StatuteRowSchema accepts valid WY row', () => {
  const r = buildRow({
    section: '6-2-101',
    titleText: 'Murder in the first degree; penalty.',
    bodyText: 'Whoever purposely and with premeditated malice kills any human being.',
    sourceUrl: 'https://wyoleg.gov/statutes/compress/title06.pdf#section-6-2-101',
    scrapedAt: '2026-05-02T00:00:00.000Z',
  });
  const check = StatuteRowSchema.safeParse(r);
  assert.ok(check.success, JSON.stringify(check.error?.issues));
});

test('StatuteRowSchema rejects non-wyoleg primary URL', () => {
  const r = buildRow({
    section: '6-2-101',
    titleText: 'M',
    bodyText: 'long enough body text to satisfy zod minimum',
    sourceUrl: 'https://law.justia.com/codes/wyoming/2024/title-6/chapter-2/section-6-2-101',
  });
  assert.equal(StatuteRowSchema.safeParse(r).success, false);
});

test('textArrayLiteral escapes CR/LF/quotes', () => {
  const lit = textArrayLiteral(['a"b\\c\nd\re']);
  assert.ok(!lit.includes('\n'));
  assert.ok(lit.includes('\\"'));
});

test('seedWY dry-run with sectionsOverride wires pipeline end-to-end', async () => {
  const sections = parseWyTitle06Text(TXT_FIXTURE);
  const out = await seedWY({
    dryRun: true,
    verbose: false,
    sectionsOverride: sections,
  });
  assert.ok(out.rows.length > 0, 'expected rows from fixture');
  for (const r of out.rows) {
    assert.equal(r.jurisdiction, 'WY');
    assert.equal(r.title, '6');
    assert.ok(r.source_urls[0].includes('wyoleg.gov'));
  }
});

test('seedWY non-dry-run with under-floor count throws BEFORE dbFactory call', async () => {
  const sections = parseWyTitle06Text(TXT_FIXTURE);
  let factoryCalls = 0;
  const dbFactory = async () => { factoryCalls += 1; throw new Error('factory should not be called'); };
  await assert.rejects(
    () => seedWY({ dryRun: false, sectionsOverride: sections, dbFactory }),
    /below floor/,
  );
  assert.equal(factoryCalls, 0);
});
