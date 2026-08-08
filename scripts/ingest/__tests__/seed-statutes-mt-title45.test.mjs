// Template: scripts/ingest/__tests__/seed-statutes-mn-chapter609.test.mjs
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02)
// csv-bulk-checked: none-exists - synthetic + pre-captured fixtures, no network
//
// Unit tests for MT Wave 2 Title 45 (Crimes) seeder. Fixtures synthesized
// 2026-05-02 from MT MCA URL pattern verified via WebSearch + design report.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MT_COHORT_DEFAULT,
  MT_CHAPTER_DESCRIPTIONS,
  MT_TITLE45_ROW_FLOOR,
  bucketBParse,
  buildDiscoverClosure,
  buildSourceUrlClosure,
  buildTitleConfig,
  parseCliFlags,
} from '../seed-statutes-mt-title45.mjs';

import {
  decodeEntities,
  stripHtml,
  padMT,
  buildChapterListUrl,
  buildPartsIndexUrl,
  buildSectionsIndexUrl,
  buildSectionUrl,
  discoverChapterUrls,
  discoverPartUrls,
  discoverSectionUrls,
  parseSection,
  sectionIdFromUrl,
} from '../lib/mt-html.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, 'fixtures', 'mt');

function loadFixture(name) {
  const p = path.join(FIXTURES, name);
  return fs.readFileSync(p, 'utf-8');
}

// ── Constants ────────────────────────────────────────────────────────────

test('MT_COHORT_DEFAULT is single-title [45]', () => {
  assert.deepEqual(MT_COHORT_DEFAULT, ['45']);
});

test('MT_CHAPTER_DESCRIPTIONS has 10 chapter labels', () => {
  for (let i = 1; i <= 10; i++) {
    assert.ok(MT_CHAPTER_DESCRIPTIONS[String(i)], `chapter ${i} missing`);
  }
});

test('MT_CHAPTER_DESCRIPTIONS chapter 5 = Offenses Against the Person', () => {
  assert.match(MT_CHAPTER_DESCRIPTIONS['5'], /Offenses Against the Person/i);
});

test('MT_TITLE45_ROW_FLOOR set to ≥250 (design report estimates ~400-500 active)', () => {
  assert.ok(MT_TITLE45_ROW_FLOOR >= 250);
});

// ── CLI flags ────────────────────────────────────────────────────────────

test('parseCliFlags defaults are dryRun=false, no limit, no chapters', () => {
  const f = parseCliFlags([]);
  assert.equal(f.dryRun, false);
  assert.equal(f.verbose, false);
  assert.equal(f.limit, null);
  assert.equal(f.chapters, null);
});

test('parseCliFlags handles --dry-run + --limit + --verbose', () => {
  const f = parseCliFlags(['--dry-run', '--limit=5', '--verbose']);
  assert.equal(f.dryRun, true);
  assert.equal(f.verbose, true);
  assert.equal(f.limit, 5);
});

test('parseCliFlags --chapters=5 parses', () => {
  const f = parseCliFlags(['--chapters=5']);
  assert.deepEqual(f.chapters, ['5']);
});

test('parseCliFlags --chapters=5,9 parses comma list', () => {
  const f = parseCliFlags(['--chapters=5,9']);
  assert.deepEqual(f.chapters, ['5', '9']);
});

test('parseCliFlags rejects out-of-range chapters (>10)', () => {
  const f = parseCliFlags(['--chapters=5,99,foo']);
  assert.deepEqual(f.chapters, ['5']);
});

test('parseCliFlags rejects 0 (chapter range is 1..10)', () => {
  const f = parseCliFlags(['--chapters=0']);
  assert.equal(f.chapters, null);
});

test('parseCliFlags --limit=0 rejected', () => {
  const f = parseCliFlags(['--limit=0']);
  assert.equal(f.limit, null);
});

test('parseCliFlags --limit=-1 rejected', () => {
  const f = parseCliFlags(['--limit=-1']);
  assert.equal(f.limit, null);
});

// ── padMT ────────────────────────────────────────────────────────────────

test('padMT zero-pads to 3 digits + trailing 0', () => {
  assert.equal(padMT(5), '0050');
  assert.equal(padMT(10), '0100');
  assert.equal(padMT(1), '0010');
  assert.equal(padMT(198), '1980');
  assert.equal(padMT('5'), '0050');
});

test('padMT throws on non-numeric input', () => {
  assert.throws(() => padMT('foo'));
  assert.throws(() => padMT('5a'));
});

// ── URL builders ─────────────────────────────────────────────────────────

test('buildChapterListUrl produces title chapters_index URL', () => {
  assert.equal(
    buildChapterListUrl(),
    'https://mca.legmt.gov/bills/mca/title_0450/chapters_index.html',
  );
});

test('buildPartsIndexUrl encodes chapter as 4-char zero-padded', () => {
  assert.equal(
    buildPartsIndexUrl(5),
    'https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/parts_index.html',
  );
  assert.equal(
    buildPartsIndexUrl(10),
    'https://mca.legmt.gov/bills/mca/title_0450/chapter_0100/parts_index.html',
  );
});

test('buildSectionsIndexUrl encodes chapter+part', () => {
  assert.equal(
    buildSectionsIndexUrl(5, 1),
    'https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/sections_index.html',
  );
});

test('buildSectionUrl encodes chapter+part+section + filename stem', () => {
  assert.equal(
    buildSectionUrl(5, 1, 102),
    'https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/section_1020/0450-0050-0010-1020.html',
  );
});

// ── Source URL closure ──────────────────────────────────────────────────

test('buildSourceUrlClosure returns mapped URL', () => {
  const map = new Map([
    ['45-5-102', 'https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/section_0020/0450-0050-0010-0020.html'],
  ]);
  const fn = buildSourceUrlClosure(map);
  assert.equal(
    fn('45-5-102'),
    'https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/section_0020/0450-0050-0010-0020.html',
  );
});

test('buildSourceUrlClosure throws on unknown section', () => {
  const fn = buildSourceUrlClosure(new Map());
  assert.throws(() => fn('45-9-999'));
});

// ── Discover closure ────────────────────────────────────────────────────

test('buildDiscoverClosure returns the pre-built descriptor list synchronously', () => {
  const descriptors = [
    { sectionNum: '45-5-102', chapterNum: '5', sectionUrl: 'https://x' },
    { sectionNum: '45-5-103', chapterNum: '5', sectionUrl: 'https://y' },
  ];
  const fn = buildDiscoverClosure(descriptors);
  const out = fn('<html>ignored</html>', { titleNum: '45' });
  assert.equal(out, descriptors);
  assert.equal(out.length, 2);
});

// ── Title config builder ────────────────────────────────────────────────

test('buildTitleConfig produces stateCode=MT + titleNum=45', () => {
  const map = new Map([['45-5-102', 'https://mca.legmt.gov/x']]);
  const desc = [{ sectionNum: '45-5-102', chapterNum: '5', sectionUrl: 'https://mca.legmt.gov/x' }];
  const c = buildTitleConfig(desc, map);
  assert.equal(c.stateCode, 'MT');
  assert.equal(c.stateName, 'Montana');
  assert.equal(c.titleNum, '45');
  assert.match(c.titleLabel, /Title 45/);
  assert.equal(c.chapterListUrl, 'https://mca.legmt.gov/bills/mca/title_0450/chapters_index.html');
});

test('buildTitleConfig allowedHosts limited to mca.legmt.gov', () => {
  const c = buildTitleConfig([], new Map());
  assert.ok(c.allowedHosts instanceof Set);
  assert.ok(c.allowedHosts.has('mca.legmt.gov'));
  assert.ok(!c.allowedHosts.has('archive.legmt.gov'));
  assert.ok(!c.allowedHosts.has('justia.com'));
});

test('buildTitleConfig crawl-delay floor 2500ms (Akamai-conservative)', () => {
  const c = buildTitleConfig([], new Map());
  assert.equal(c.crawlDelay, 'none');
  assert.equal(c.crawlDelayMs, 2500);
  assert.equal(c.fetchTimeoutMs, 45000);
});

test('buildTitleConfig wires Mozilla UA (not default crawler)', () => {
  const c = buildTitleConfig([], new Map());
  assert.match(c.userAgent, /Mozilla/);
});

test('buildTitleConfig wires discover/parse/buildSourceUrl', () => {
  const c = buildTitleConfig([], new Map([['45-5-102', 'https://x']]));
  assert.equal(typeof c.discoverSections, 'function');
  assert.equal(typeof c.parseSection, 'function');
  assert.equal(typeof c.buildSourceUrl, 'function');
});

// ── lib helpers ─────────────────────────────────────────────────────────

test('decodeEntities handles common entities', () => {
  assert.equal(decodeEntities('&amp;'), '&');
  assert.equal(decodeEntities('&sect;'), '§');
  assert.equal(decodeEntities('&quot;hi&quot;'), '"hi"');
});

test('stripHtml drops Akamai prefix block', () => {
  const out = stripHtml('<APM_DO_NOT_TOUCH><script>akm()</script></APM_DO_NOT_TOUCH><p>real text</p>');
  assert.match(out, /real text/);
  assert.doesNotMatch(out, /akm/);
});

test('stripHtml drops script + style blocks', () => {
  const out = stripHtml('<p>keep</p><script>alert(1)</script><style>p{}</style>');
  assert.match(out, /keep/);
  assert.doesNotMatch(out, /alert/);
});

test('sectionIdFromUrl extracts 45-C-S identifier', () => {
  assert.equal(
    sectionIdFromUrl('https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/section_0020/0450-0050-0010-0020.html'),
    '45-5-2',
  );
  assert.equal(
    sectionIdFromUrl('https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/section_1020/0450-0050-0010-1020.html'),
    '45-5-102',
  );
});

test('sectionIdFromUrl throws on unparseable URL', () => {
  assert.throws(() => sectionIdFromUrl('https://example.com/foo'));
});

// ── 3-level discovery (the MT quirk) ────────────────────────────────────

test('discoverChapterUrls walks fixture → 10 chapters', () => {
  const html = loadFixture('title45-chapters-index.html');
  const chapters = discoverChapterUrls(html);
  assert.equal(chapters.length, 10);
});

test('discoverChapterUrls maps "0050" → "5"', () => {
  const html = loadFixture('title45-chapters-index.html');
  const chapters = discoverChapterUrls(html);
  const ch5 = chapters.find((c) => c.chapter === '5');
  assert.ok(ch5, 'chapter 5 not found');
  assert.match(ch5.url, /chapter_0050\/parts_index\.html$/);
});

test('discoverChapterUrls includes chapter 10 ("0100")', () => {
  const html = loadFixture('title45-chapters-index.html');
  const chapters = discoverChapterUrls(html);
  const ch10 = chapters.find((c) => c.chapter === '10');
  assert.ok(ch10, 'chapter 10 not found');
  assert.match(ch10.url, /chapter_0100\/parts_index\.html$/);
});

test('discoverChapterUrls filters out cross-title noise (title_0440)', () => {
  const html = loadFixture('title45-chapters-index.html');
  const chapters = discoverChapterUrls(html);
  for (const c of chapters) {
    assert.match(c.url, /title_0450/, `cross-title leak: ${c.url}`);
  }
});

test('discoverChapterUrls produces absolute https URLs', () => {
  const html = loadFixture('title45-chapters-index.html');
  const chapters = discoverChapterUrls(html);
  for (const c of chapters) {
    assert.match(c.url, /^https:\/\/mca\.legmt\.gov\//);
  }
});

test('discoverPartUrls walks chapter 5 fixture → 5 parts', () => {
  const html = loadFixture('chapter5-parts-index.html');
  const parts = discoverPartUrls(html, 5);
  assert.equal(parts.length, 5);
});

test('discoverPartUrls returns chapter+part canonical numbers', () => {
  const html = loadFixture('chapter5-parts-index.html');
  const parts = discoverPartUrls(html, 5);
  const part1 = parts.find((p) => p.part === '1');
  assert.ok(part1);
  assert.equal(part1.chapter, '5');
  assert.match(part1.url, /chapter_0050\/part_0010\/sections_index\.html$/);
});

test('discoverPartUrls chapter filter rejects mismatched chapter', () => {
  const html = loadFixture('chapter5-parts-index.html');
  const parts = discoverPartUrls(html, 9);
  assert.equal(parts.length, 0);
});

test('discoverSectionUrls walks chapter 5 part 1 fixture → 6 sections', () => {
  const html = loadFixture('chapter5-part1-sections-index.html');
  const sections = discoverSectionUrls(html);
  assert.equal(sections.length, 6);
});

test('discoverSectionUrls returns canonical sectionNum like "45-5-102"', () => {
  const html = loadFixture('chapter5-part1-sections-index.html');
  const sections = discoverSectionUrls(html);
  const s102 = sections.find((s) => s.sectionNum === '45-5-102');
  assert.ok(s102, 'section 45-5-102 not found');
  assert.equal(s102.chapter, '5');
  assert.equal(s102.part, '1');
  assert.equal(s102.section, '102');
  assert.match(s102.url, /section_1020\/0450-0050-0010-1020\.html$/);
});

test('discoverSectionUrls dedupes URLs', () => {
  const html = loadFixture('chapter5-part1-sections-index.html');
  const sections = discoverSectionUrls(html);
  const seen = new Set();
  for (const s of sections) {
    assert.ok(!seen.has(s.url), `duplicate: ${s.url}`);
    seen.add(s.url);
  }
});

test('discoverSectionUrls handles empty/short HTML', () => {
  assert.deepEqual(discoverSectionUrls(''), []);
  assert.deepEqual(discoverSectionUrls('<html></html>'), []);
});

test('discoverSectionUrls ctx filters by chapter+part', () => {
  const html = loadFixture('chapter5-part1-sections-index.html');
  const matched = discoverSectionUrls(html, { chapter: 5, part: 1 });
  assert.equal(matched.length, 6);
  const wrong = discoverSectionUrls(html, { chapter: 9, part: 1 });
  assert.equal(wrong.length, 0);
});

// ── Section parser ──────────────────────────────────────────────────────

test('parseSection extracts title + body from active 45-5-102 fixture', () => {
  const html = loadFixture('section-45-5-102-active.html');
  const parsed = parseSection(html, '45-5-102');
  assert.ok(parsed, 'parser returned null on real active fixture');
  assert.match(parsed.titleText, /Deliberate homicide/i);
  assert.ok(parsed.bodyText.length >= 30);
  assert.match(parsed.bodyText, /purposely or knowingly/i);
  assert.equal(parsed.effectiveDate, null);
});

test('parseSection drops Akamai prefix from body', () => {
  const html = loadFixture('section-45-5-102-active.html');
  const parsed = parseSection(html, '45-5-102');
  assert.ok(parsed);
  assert.doesNotMatch(parsed.bodyText, /Akamai Bot Manager/);
  assert.doesNotMatch(parsed.bodyText, /akm=1/);
});

test('parseSection drops history footer from body', () => {
  const html = loadFixture('section-45-5-102-active.html');
  const parsed = parseSection(html, '45-5-102');
  assert.ok(parsed);
  assert.doesNotMatch(parsed.bodyText, /Ch\. 513, L\. 1973/);
});

test('parseSection returns null on repealed shell (45-5-198)', () => {
  const html = loadFixture('section-45-5-198-repealed.html');
  const parsed = parseSection(html, '45-5-198');
  assert.equal(parsed, null, 'repealed shell must return null');
});

test('parseSection returns null when section number mismatches heading', () => {
  const html = loadFixture('section-45-5-102-active.html');
  const parsed = parseSection(html, '45-5-999'); // wrong section num
  assert.equal(parsed, null);
});

test('parseSection returns null on too-short HTML (defensive)', () => {
  assert.equal(parseSection('<html></html>', '45-5-102'), null);
});

test('parseSection handles long Akamai prefix with realistic JS payload', () => {
  const html = loadFixture('section-45-2-101-with-akamai-prefix.html');
  const parsed = parseSection(html, '45-2-101');
  assert.ok(parsed, 'parser returned null on Akamai-heavy fixture');
  assert.match(parsed.titleText, /General definitions/i);
  assert.ok(parsed.bodyText.length >= 30);
  assert.doesNotMatch(parsed.bodyText, /akamai/i);
  assert.doesNotMatch(parsed.bodyText, /_0xfingerprint/);
  assert.doesNotMatch(parsed.bodyText, /navigator\.userAgent/);
});

test('parseSection output shape is {titleText, bodyText, effectiveDate}', () => {
  const html = loadFixture('section-45-5-102-active.html');
  const parsed = parseSection(html, '45-5-102');
  assert.ok(parsed);
  assert.deepEqual(
    Object.keys(parsed).sort(),
    ['bodyText', 'effectiveDate', 'titleText'],
  );
});

// ── Adapter: bucketBParse ──────────────────────────────────────────────

test('bucketBParse extracts title + body from active fixture', () => {
  const html = loadFixture('section-45-5-102-active.html');
  const parsed = bucketBParse(html, '45-5-102');
  assert.ok(parsed);
  assert.ok(parsed.titleText);
  assert.ok(parsed.bodyText.length >= 30);
});

test('bucketBParse returns null on repealed shell', () => {
  const html = loadFixture('section-45-5-198-repealed.html');
  const parsed = bucketBParse(html, '45-5-198');
  assert.equal(parsed, null);
});

test('bucketBParse output shape is {titleText, bodyText} (no effectiveDate leakage)', () => {
  const html = loadFixture('section-45-5-102-active.html');
  const parsed = bucketBParse(html, '45-5-102');
  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed).sort(), ['bodyText', 'titleText']);
});

// ── Real MT 2025 fixtures (locked from live mca.legmt.gov 2026-05-02) ───

test('discoverChapterUrls walks REAL title 45 TOC fixture → 10 chapters', () => {
  const html = loadFixture('title45-chapters-index-real-2025.html');
  const chapters = discoverChapterUrls(html);
  assert.equal(chapters.length, 10, `expected 10 chapters in real fixture, got ${chapters.length}`);
});

test('discoverChapterUrls real fixture resolves "./chapter_NNNN/parts_index.html" to absolute', () => {
  const html = loadFixture('title45-chapters-index-real-2025.html');
  const chapters = discoverChapterUrls(html);
  for (const c of chapters) {
    assert.match(c.url, /^https:\/\/mca\.legmt\.gov\/bills\/mca\/title_0450\/chapter_\d{4}\/parts_index\.html$/);
  }
});

test('discoverPartUrls walks REAL chapter 5 parts fixture → ≥5 parts', () => {
  const html = loadFixture('chapter5-parts-index-real-2025.html');
  const parts = discoverPartUrls(html, 5);
  assert.ok(parts.length >= 5, `expected ≥5 parts in real chapter 5 fixture, got ${parts.length}`);
});

test('discoverPartUrls real fixture derives chapter from baseUrl-resolved absolute URL', () => {
  const html = loadFixture('chapter5-parts-index-real-2025.html');
  const parts = discoverPartUrls(html, 5);
  for (const p of parts) {
    assert.equal(p.chapter, '5', `chapter mismatch on ${p.url}`);
    assert.match(p.url, /^https:\/\/mca\.legmt\.gov\/bills\/mca\/title_0450\/chapter_0050\/part_\d{4}\/sections_index\.html$/);
  }
});

test('parseSection extracts title + body from REAL MT 2025 §45-1-101 fixture', () => {
  const html = loadFixture('section-45-1-101-real-2025.html');
  const parsed = parseSection(html, '45-1-101');
  assert.ok(parsed, 'parser returned null on real MT 2025 fixture');
  assert.match(parsed.titleText, /short title/i);
  assert.ok(parsed.bodyText.length >= 30, `bodyText too short: ${parsed.bodyText.length}`);
  assert.match(parsed.bodyText, /Criminal Code of 1973/i);
  assert.equal(parsed.effectiveDate, null);
});

test('parseSection real fixture drops history-doc footer', () => {
  const html = loadFixture('section-45-1-101-real-2025.html');
  const parsed = parseSection(html, '45-1-101');
  assert.ok(parsed);
  // History contains "Sec. 1, Ch. 513, L. 1973" and "R.C.M. 1947" — must NOT appear in body
  assert.doesNotMatch(parsed.bodyText, /Sec\. 1, Ch\. 513, L\. 1973/);
  assert.doesNotMatch(parsed.bodyText, /R\.C\.M\. 1947/);
});

test('parseSection real fixture rejects citation/sectionNum mismatch', () => {
  const html = loadFixture('section-45-1-101-real-2025.html');
  const parsed = parseSection(html, '45-1-999');
  assert.equal(parsed, null, 'mismatched citation must reject the parse');
});

test('discoverSectionUrls real fixture extracts canonical citation from inner span', () => {
  const html = loadFixture('chapter5-part1-sections-index-real-2025.html');
  const sections = discoverSectionUrls(html, { chapter: 5, part: 1 });
  assert.ok(sections.length >= 6, `expected ≥6 sections in real chapter 5 part 1, got ${sections.length}`);
  const s102 = sections.find((s) => s.sectionNum === '45-5-102');
  assert.ok(s102, 'section 45-5-102 not found in real fixture');
  assert.match(s102.url, /\/section_0020\/0450-0050-0010-0020\.html$/);
});

test('discoverSectionUrls real fixture: ALL sectionNums are canonical 45-C-S form', () => {
  const html = loadFixture('chapter5-part1-sections-index-real-2025.html');
  const sections = discoverSectionUrls(html, { chapter: 5, part: 1 });
  for (const s of sections) {
    assert.match(s.sectionNum, /^45-5-\d+$/, `bad sectionNum ${s.sectionNum} for ${s.url}`);
  }
});
