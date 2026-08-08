// Template: scripts/ingest/__tests__/seed-statutes-ma-criminal.test.mjs
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02)
// csv-bulk-checked: none-exists - synthetic + pre-captured fixtures, no network
//
// Unit tests for MN Wave 2 Chapter 609 seeder. Fixtures captured 2026-05-02 from
// revisor.mn.gov live site.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MN_COHORT_DEFAULT,
  MN_CHAPTER_DESCRIPTIONS,
  MN_CHAPTER609_ROW_FLOOR,
  bucketBDiscover,
  bucketBParse,
  buildSourceUrl,
  buildChapterConfig,
  parseCliFlags,
} from '../seed-statutes-mn-chapter609.mjs';

import {
  discoverSectionUrls,
  parseSection,
  sectionIdFromUrl,
  buildChapterUrl,
  buildMNSourceUrl,
  stripHtml,
  decodeEntities,
} from '../lib/mn-html.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, 'fixtures', 'mn');

function loadFixture(name) {
  const p = path.join(FIXTURES, name);
  return fs.readFileSync(p, 'utf-8');
}

// ── Constants ────────────────────────────────────────────────────────────

test('MN_COHORT_DEFAULT is single-chapter [609]', () => {
  assert.deepEqual(MN_COHORT_DEFAULT, ['609']);
});

test('MN_CHAPTER_DESCRIPTIONS has Criminal Code label for 609', () => {
  assert.ok(MN_CHAPTER_DESCRIPTIONS['609']);
  assert.match(MN_CHAPTER_DESCRIPTIONS['609'], /Criminal/i);
});

test('MN_CHAPTER609_ROW_FLOOR set to ≥280 (verified TOC has ~376 active sections)', () => {
  assert.ok(MN_CHAPTER609_ROW_FLOOR >= 280);
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

test('parseCliFlags --chapters=609 parses', () => {
  const f = parseCliFlags(['--chapters=609']);
  assert.deepEqual(f.chapters, ['609']);
});

test('parseCliFlags rejects malformed chapter labels (MN is numeric only)', () => {
  const f = parseCliFlags(['--chapters=ABC,609,foo']);
  assert.deepEqual(f.chapters, ['609']);
});

test('parseCliFlags --limit=0 rejected', () => {
  const f = parseCliFlags(['--limit=0']);
  assert.equal(f.limit, null);
});

test('parseCliFlags --limit=-1 rejected', () => {
  const f = parseCliFlags(['--limit=-1']);
  assert.equal(f.limit, null);
});

// ── Source URL builder ──────────────────────────────────────────────────

test('buildSourceUrl produces canonical revisor.mn.gov URL', () => {
  const u = buildSourceUrl('609.02');
  assert.equal(u, 'https://www.revisor.mn.gov/statutes/cite/609.02');
});

test('buildSourceUrl handles 4-digit section IDs (609.2112)', () => {
  const u = buildSourceUrl('609.2112');
  assert.equal(u, 'https://www.revisor.mn.gov/statutes/cite/609.2112');
});

test('buildMNSourceUrl + buildSourceUrl agree', () => {
  assert.equal(buildSourceUrl('609.02'), buildMNSourceUrl('609.02'));
});

test('buildChapterUrl produces chapter TOC URL', () => {
  assert.equal(buildChapterUrl(609), 'https://www.revisor.mn.gov/statutes/cite/609');
  assert.equal(buildChapterUrl('609'), 'https://www.revisor.mn.gov/statutes/cite/609');
});

// ── Per-chapter config builder ──────────────────────────────────────────

test('buildChapterConfig produces stateCode=MN + correct titleNum', () => {
  const c = buildChapterConfig('609');
  assert.equal(c.stateCode, 'MN');
  assert.equal(c.stateName, 'Minnesota');
  assert.equal(c.titleNum, '609');
  assert.equal(c.titleLabel, MN_CHAPTER_DESCRIPTIONS['609']);
  assert.ok(c.chapterListUrl.startsWith('https://www.revisor.mn.gov/'));
  assert.ok(c.chapterListUrl.endsWith('/cite/609'));
});

test('buildChapterConfig allowedHosts limited to revisor.mn.gov + www', () => {
  const c = buildChapterConfig('609');
  assert.ok(c.allowedHosts instanceof Set);
  assert.ok(c.allowedHosts.has('www.revisor.mn.gov'));
  assert.ok(c.allowedHosts.has('revisor.mn.gov'));
  assert.ok(!c.allowedHosts.has('justia.com'));
});

test('buildChapterConfig crawl-delay matches MN robots (none, polite 1500ms)', () => {
  const c = buildChapterConfig('609');
  assert.equal(c.crawlDelay, 'none');
  assert.equal(c.crawlDelayMs, 1500);
});

test('buildChapterConfig wires sibling-built MN adapter functions', () => {
  const c = buildChapterConfig('609');
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

test('stripHtml drops tags + collapses whitespace', () => {
  const out = stripHtml('<div class="x">  hello   <b>world</b>  </div>');
  assert.equal(out, 'hello world');
});

test('stripHtml drops script + style blocks', () => {
  const out = stripHtml('<p>keep</p><script>alert(1)</script><style>p{}</style>');
  assert.match(out, /keep/);
  assert.doesNotMatch(out, /alert/);
  assert.doesNotMatch(out, /\{}/);
});

test('sectionIdFromUrl extracts dot-syntax section number', () => {
  assert.equal(sectionIdFromUrl('https://www.revisor.mn.gov/statutes/cite/609.02'), '609.02');
  assert.equal(sectionIdFromUrl('https://www.revisor.mn.gov/statutes/cite/609.2112'), '609.2112');
});

test('sectionIdFromUrl throws on unparseable URL', () => {
  assert.throws(() => sectionIdFromUrl('https://example.com/foo'));
});

// ── TOC discovery ───────────────────────────────────────────────────────

test('discoverSectionUrls walks chapter-609 fixture → ≥280 active descriptors', () => {
  const html = loadFixture('chapter609-toc-sample.html');
  const urls = discoverSectionUrls(html, '609');
  assert.ok(
    urls.length >= 280,
    `expected ≥280 active sections in ch609, got ${urls.length}`,
  );
});

test('discoverSectionUrls filters out renumbered sections (609.001 inactive)', () => {
  const html = loadFixture('chapter609-toc-sample.html');
  const urls = discoverSectionUrls(html, '609');
  // 609.001 has td.inactive → "MS 2006 [Renumbered ...]" → must be excluded
  assert.ok(
    !urls.includes('https://www.revisor.mn.gov/statutes/cite/609.001'),
    'renumbered 609.001 should be filtered',
  );
});

test('discoverSectionUrls includes 609.02 (active)', () => {
  const html = loadFixture('chapter609-toc-sample.html');
  const urls = discoverSectionUrls(html, '609');
  assert.ok(
    urls.includes('https://www.revisor.mn.gov/statutes/cite/609.02'),
    'active 609.02 should be present',
  );
});

test('discoverSectionUrls dedupes URLs', () => {
  const html = loadFixture('chapter609-toc-sample.html');
  const urls = discoverSectionUrls(html, '609');
  const seen = new Set();
  for (const u of urls) {
    assert.ok(!seen.has(u), `duplicate URL: ${u}`);
    seen.add(u);
  }
});

test('discoverSectionUrls all URLs are HTTPS revisor.mn.gov', () => {
  const html = loadFixture('chapter609-toc-sample.html');
  const urls = discoverSectionUrls(html, '609');
  for (const u of urls.slice(0, 50)) {
    assert.match(u, /^https:\/\/www\.revisor\.mn\.gov\/statutes\/cite\/609\.[0-9A-Za-z]+$/);
  }
});

test('discoverSectionUrls handles wrong-chapter prefix (returns 0)', () => {
  const html = loadFixture('chapter609-toc-sample.html');
  const urls = discoverSectionUrls(html, '152');
  // Chapter 609 TOC doesn't link to 152.* sections
  assert.equal(urls.length, 0);
});

test('discoverSectionUrls handles empty/short HTML', () => {
  assert.deepEqual(discoverSectionUrls('', '609'), []);
  assert.deepEqual(discoverSectionUrls('<html></html>', '609'), []);
});

// ── Section parser ──────────────────────────────────────────────────────

test('parseSection extracts title + body from active 609.02 fixture', () => {
  const html = loadFixture('section-609-02-sample.html');
  const parsed = parseSection(html, '609.02');
  assert.ok(parsed, 'parser returned null on real active fixture');
  assert.ok(parsed.titleText, 'titleText empty');
  assert.match(parsed.titleText, /DEFINITIONS/i);
  assert.ok(parsed.bodyText, 'bodyText empty');
  assert.ok(parsed.bodyText.length >= 30, `bodyText too short: ${parsed.bodyText.length}`);
  assert.match(parsed.bodyText, /Crime/);
  assert.equal(parsed.effectiveDate, null);
});

test('parseSection returns null on whole-section repealed (609.155, class="sr")', () => {
  const html = loadFixture('section-609-155-repealed.html');
  const parsed = parseSection(html, '609.155');
  assert.equal(parsed, null, 'whole-section repealed must return null');
});

test('parseSection returns null on per-subd renumbered shell (609.21, class="sr_by_subd")', () => {
  const html = loadFixture('section-609-21-shell.html');
  const parsed = parseSection(html, '609.21');
  assert.equal(parsed, null, 'sr_by_subd shell with empty headnote must return null');
});

test('parseSection returns null on too-short HTML (defensive)', () => {
  assert.equal(parseSection('<html></html>', '609.02'), null);
});

test('parseSection returns null when section number mismatches heading', () => {
  const html = loadFixture('section-609-02-sample.html');
  const parsed = parseSection(html, '609.99'); // wrong section num
  assert.equal(parsed, null, 'mismatched section num must return null');
});

test('parseSection output shape is {titleText, bodyText, effectiveDate}', () => {
  const html = loadFixture('section-609-02-sample.html');
  const parsed = parseSection(html, '609.02');
  assert.ok(parsed);
  assert.deepEqual(
    Object.keys(parsed).sort(),
    ['bodyText', 'effectiveDate', 'titleText'],
  );
});

// ── Adapter: bucketBDiscover ────────────────────────────────────────────

test('bucketBDiscover walks chapter-609 fixture → matches lib discoverSectionUrls count', () => {
  const html = loadFixture('chapter609-toc-sample.html');
  const config = buildChapterConfig('609');
  const descriptors = bucketBDiscover(html, config);
  const libUrls = discoverSectionUrls(html, '609');
  assert.equal(descriptors.length, libUrls.length);
});

test('bucketBDiscover descriptors have sectionNum + sectionUrl + chapterNum', () => {
  const html = loadFixture('chapter609-toc-sample.html');
  const config = buildChapterConfig('609');
  const descriptors = bucketBDiscover(html, config);
  for (const d of descriptors.slice(0, 5)) {
    assert.ok(d.sectionNum, 'sectionNum missing');
    assert.ok(d.sectionUrl, 'sectionUrl missing');
    assert.ok(d.sectionUrl.startsWith('https://www.revisor.mn.gov/'));
    assert.equal(d.chapterNum, '609');
    assert.match(d.sectionNum, /^609\./, `sectionNum should start with 609., got ${d.sectionNum}`);
  }
});

test('bucketBDiscover dedupes URLs within page', () => {
  const html = loadFixture('chapter609-toc-sample.html');
  const config = buildChapterConfig('609');
  const descriptors = bucketBDiscover(html, config);
  const seen = new Set();
  for (const d of descriptors) {
    assert.ok(!seen.has(d.sectionUrl), `duplicate sectionUrl: ${d.sectionUrl}`);
    seen.add(d.sectionUrl);
  }
});

// ── Adapter: bucketBParse ──────────────────────────────────────────────

test('bucketBParse extracts title + body from active 609.02 fixture', () => {
  const html = loadFixture('section-609-02-sample.html');
  const parsed = bucketBParse(html, '609.02');
  assert.ok(parsed, 'adapter parser returned null on real fixture');
  assert.ok(parsed.titleText);
  assert.ok(parsed.bodyText);
  assert.ok(parsed.bodyText.length >= 30);
});

test('bucketBParse returns null on repealed shell', () => {
  const html = loadFixture('section-609-155-repealed.html');
  const parsed = bucketBParse(html, '609.155');
  assert.equal(parsed, null);
});

test('bucketBParse output shape is {titleText, bodyText} (no effectiveDate leakage)', () => {
  const html = loadFixture('section-609-02-sample.html');
  const parsed = bucketBParse(html, '609.02');
  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed).sort(), ['bodyText', 'titleText']);
});
