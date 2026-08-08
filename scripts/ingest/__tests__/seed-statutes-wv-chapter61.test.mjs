// Template: scripts/ingest/__tests__/seed-statutes-mn-chapter609.test.mjs
// Pattern: bucket-b-html.mjs harness contract (Wave 2 design report 2026-05-02)
// csv-bulk-checked: none-exists - synthetic + pre-captured fixtures, no network
//
// Unit tests for WV Wave 2 Chapter 61 seeder. Fixtures captured 2026-05-02 from
// code.wvlegislature.gov live site.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WV_COHORT_DEFAULT,
  WV_CHAPTER_DESCRIPTIONS,
  WV_CHAPTER61_ROW_FLOOR,
  bucketBParse,
  buildSourceUrl,
  buildChapterConfig,
  parseCliFlags,
} from '../seed-statutes-wv-chapter61.mjs';

import {
  discoverArticleUrls,
  discoverSectionUrlsForArticle,
  discoverSections,
  prefetchArticleTocs,
  parseSection,
  sectionIdFromUrl,
  articleIdFromUrl,
  sectionUrlSlug,
  buildChapterUrl,
  buildArticleUrl,
  buildWVSourceUrl,
  stripHtml,
  decodeEntities,
} from '../lib/wv-html.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, 'fixtures', 'wv');

function loadFixture(name) {
  const p = path.join(FIXTURES, name);
  return fs.readFileSync(p, 'utf-8');
}

// ── Constants ────────────────────────────────────────────────────────────

test('WV_COHORT_DEFAULT is single-chapter [61]', () => {
  assert.deepEqual(WV_COHORT_DEFAULT, ['61']);
});

test('WV_CHAPTER_DESCRIPTIONS has Crimes label for 61', () => {
  assert.ok(WV_CHAPTER_DESCRIPTIONS['61']);
  assert.match(WV_CHAPTER_DESCRIPTIONS['61'], /Crimes/i);
});

test('WV_CHAPTER61_ROW_FLOOR set to ≥240 (Wave 2 plan estimate 250-350)', () => {
  assert.ok(WV_CHAPTER61_ROW_FLOOR >= 240);
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

test('parseCliFlags --chapters=61 parses', () => {
  const f = parseCliFlags(['--chapters=61']);
  assert.deepEqual(f.chapters, ['61']);
});

test('parseCliFlags rejects malformed chapter labels (WV is numeric only)', () => {
  const f = parseCliFlags(['--chapters=ABC,61,foo']);
  assert.deepEqual(f.chapters, ['61']);
});

test('parseCliFlags --limit=0 rejected', () => {
  const f = parseCliFlags(['--limit=0']);
  assert.equal(f.limit, null);
});

test('parseCliFlags --limit=-1 rejected', () => {
  const f = parseCliFlags(['--limit=-1']);
  assert.equal(f.limit, null);
});

// ── URL builders ─────────────────────────────────────────────────────────

test('buildSourceUrl produces canonical code.wvlegislature.gov URL', () => {
  const u = buildSourceUrl('61-2-1');
  assert.equal(u, 'https://code.wvlegislature.gov/61-2-1/');
});

test('buildSourceUrl uppercases trailing letter to match host casing (61-2-9a → /61-2-9A/)', () => {
  const u = buildSourceUrl('61-2-9a');
  assert.equal(u, 'https://code.wvlegislature.gov/61-2-9A/');
});

test('buildSourceUrl handles multi-digit + letter suffix (61-2-14d → /61-2-14D/)', () => {
  const u = buildSourceUrl('61-2-14d');
  assert.equal(u, 'https://code.wvlegislature.gov/61-2-14D/');
});

test('buildWVSourceUrl + buildSourceUrl agree', () => {
  assert.equal(buildSourceUrl('61-2-1'), buildWVSourceUrl('61-2-1'));
});

test('buildChapterUrl produces chapter index URL', () => {
  assert.equal(buildChapterUrl(61), 'https://code.wvlegislature.gov/61/');
  assert.equal(buildChapterUrl('61'), 'https://code.wvlegislature.gov/61/');
});

test('buildArticleUrl handles letter-suffixed articles (8B, 12A)', () => {
  assert.equal(buildArticleUrl(61, '2'), 'https://code.wvlegislature.gov/61-2/');
  assert.equal(buildArticleUrl(61, '8B'), 'https://code.wvlegislature.gov/61-8B/');
  assert.equal(buildArticleUrl(61, '12A'), 'https://code.wvlegislature.gov/61-12A/');
});

test('sectionUrlSlug uppercases trailing letter for URL', () => {
  assert.equal(sectionUrlSlug('61-2-1'), '61-2-1');
  assert.equal(sectionUrlSlug('61-2-9a'), '61-2-9A');
  assert.equal(sectionUrlSlug('61-2-14d'), '61-2-14D');
});

// ── Per-chapter config builder ──────────────────────────────────────────

test('buildChapterConfig produces stateCode=WV + correct titleNum', () => {
  const c = buildChapterConfig('61');
  assert.equal(c.stateCode, 'WV');
  assert.equal(c.stateName, 'West Virginia');
  assert.equal(c.titleNum, '61');
  assert.equal(c.titleLabel, WV_CHAPTER_DESCRIPTIONS['61']);
  assert.ok(c.chapterListUrl.startsWith('https://code.wvlegislature.gov/'));
  assert.ok(c.chapterListUrl.endsWith('/61/'));
});

test('buildChapterConfig allowedHosts limited to code.wvlegislature.gov', () => {
  const c = buildChapterConfig('61');
  assert.ok(c.allowedHosts instanceof Set);
  assert.ok(c.allowedHosts.has('code.wvlegislature.gov'));
  assert.ok(!c.allowedHosts.has('justia.com'));
  assert.ok(!c.allowedHosts.has('www.code.wvlegislature.gov'));
});

test('buildChapterConfig crawl-delay matches WV robots (none, polite 1500ms)', () => {
  const c = buildChapterConfig('61');
  assert.equal(c.crawlDelay, 'none');
  assert.equal(c.crawlDelayMs, 1500);
});

test('buildChapterConfig wires sibling-built WV adapter functions', () => {
  const c = buildChapterConfig('61');
  assert.equal(typeof c.discoverSections, 'function');
  assert.equal(typeof c.parseSection, 'function');
  assert.equal(typeof c.buildSourceUrl, 'function');
  assert.equal(typeof c.fetchArticle, 'function');
});

test('buildChapterConfig accepts test-injected fetchArticle override', () => {
  const stub = async () => '<html></html>';
  const c = buildChapterConfig('61', { fetchArticle: stub });
  assert.equal(c.fetchArticle, stub);
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

test('sectionIdFromUrl extracts canonical section number (lowercased)', () => {
  assert.equal(sectionIdFromUrl('https://code.wvlegislature.gov/61-2-1/'), '61-2-1');
  assert.equal(sectionIdFromUrl('https://code.wvlegislature.gov/61-2-9A/'), '61-2-9a');
  assert.equal(sectionIdFromUrl('https://code.wvlegislature.gov/61-2-14D/'), '61-2-14d');
});

test('sectionIdFromUrl throws on unparseable URL', () => {
  assert.throws(() => sectionIdFromUrl('https://example.com/foo'));
});

test('articleIdFromUrl extracts article portion (preserves case for letter suffixes)', () => {
  assert.equal(articleIdFromUrl('https://code.wvlegislature.gov/61-2-1/'), '2');
  assert.equal(articleIdFromUrl('https://code.wvlegislature.gov/61-8B-3/'), '8B');
});

// ── Article TOC discovery (chapter index) ───────────────────────────────

test('discoverArticleUrls walks chapter-61 fixture → finds 16+ articles', () => {
  const html = loadFixture('chapter61-toc-sample.html');
  const articles = discoverArticleUrls(html, '61');
  assert.ok(
    articles.length >= 16,
    `expected ≥16 articles in ch61, got ${articles.length}`,
  );
});

test('discoverArticleUrls includes article 2 (Crimes Against the Person)', () => {
  const html = loadFixture('chapter61-toc-sample.html');
  const articles = discoverArticleUrls(html, '61');
  const found = articles.find((a) => a.articleId === '2');
  assert.ok(found, 'article 2 should be present');
  assert.equal(found.articleUrl, 'https://code.wvlegislature.gov/61-2/');
});

test('discoverArticleUrls handles letter-suffixed articles (8B, 11A)', () => {
  const html = loadFixture('chapter61-toc-sample.html');
  const articles = discoverArticleUrls(html, '61');
  const ids = articles.map((a) => a.articleId);
  assert.ok(ids.includes('8B'), `expected 8B in articles, got [${ids.join(', ')}]`);
});

test('discoverArticleUrls dedupes URLs', () => {
  const html = loadFixture('chapter61-toc-sample.html');
  const articles = discoverArticleUrls(html, '61');
  const seen = new Set();
  for (const a of articles) {
    assert.ok(!seen.has(a.articleUrl), `duplicate URL: ${a.articleUrl}`);
    seen.add(a.articleUrl);
  }
});

test('discoverArticleUrls handles wrong-chapter prefix (returns 0)', () => {
  const html = loadFixture('chapter61-toc-sample.html');
  const articles = discoverArticleUrls(html, '60');
  assert.equal(articles.length, 0);
});

test('discoverArticleUrls handles empty/short HTML', () => {
  assert.deepEqual(discoverArticleUrls('', '61'), []);
  assert.deepEqual(discoverArticleUrls('<html></html>', '61'), []);
});

// ── Section TOC discovery (article index) ───────────────────────────────

test('discoverSectionUrlsForArticle walks article-61-2 fixture → ≥20 active sections', () => {
  const html = loadFixture('article61-2-toc-sample.html');
  const urls = discoverSectionUrlsForArticle(html, '61', '2');
  assert.ok(
    urls.length >= 20,
    `expected ≥20 active sections in article 61-2, got ${urls.length}`,
  );
});

test('discoverSectionUrlsForArticle filters out repealed sections (61-2-17 has "Repealed")', () => {
  const html = loadFixture('article61-2-toc-sample.html');
  const urls = discoverSectionUrlsForArticle(html, '61', '2');
  // 61-2-17, 61-2-18, 61-2-19, 61-2-20 are all marked "Repealed" inline
  assert.ok(
    !urls.includes('https://code.wvlegislature.gov/61-2-17/'),
    'repealed 61-2-17 should be filtered',
  );
});

test('discoverSectionUrlsForArticle includes 61-2-1 (active)', () => {
  const html = loadFixture('article61-2-toc-sample.html');
  const urls = discoverSectionUrlsForArticle(html, '61', '2');
  assert.ok(
    urls.includes('https://code.wvlegislature.gov/61-2-1/'),
    'active 61-2-1 should be present',
  );
});

test('discoverSectionUrlsForArticle preserves uppercase letter suffix in URL slug', () => {
  const html = loadFixture('article61-2-toc-sample.html');
  const urls = discoverSectionUrlsForArticle(html, '61', '2');
  assert.ok(
    urls.includes('https://code.wvlegislature.gov/61-2-9A/'),
    `expected 61-2-9A URL slug; got URLs: ${urls.slice(0, 5).join(', ')}…`,
  );
});

test('discoverSectionUrlsForArticle dedupes URLs', () => {
  const html = loadFixture('article61-2-toc-sample.html');
  const urls = discoverSectionUrlsForArticle(html, '61', '2');
  const seen = new Set();
  for (const u of urls) {
    assert.ok(!seen.has(u), `duplicate URL: ${u}`);
    seen.add(u);
  }
});

test('discoverSectionUrlsForArticle all URLs are HTTPS code.wvlegislature.gov', () => {
  const html = loadFixture('article61-2-toc-sample.html');
  const urls = discoverSectionUrlsForArticle(html, '61', '2');
  for (const u of urls.slice(0, 50)) {
    assert.match(u, /^https:\/\/code\.wvlegislature\.gov\/61-2-[0-9A-Za-z]+\/$/);
  }
});

test('discoverSectionUrlsForArticle handles wrong-article (returns 0)', () => {
  const html = loadFixture('article61-2-toc-sample.html');
  const urls = discoverSectionUrlsForArticle(html, '61', '99');
  assert.equal(urls.length, 0);
});

test('discoverSectionUrlsForArticle handles empty/short HTML', () => {
  assert.deepEqual(discoverSectionUrlsForArticle('', '61', '2'), []);
  assert.deepEqual(discoverSectionUrlsForArticle('<html></html>', '61', '2'), []);
});

// ── Section parser ──────────────────────────────────────────────────────

test('parseSection extracts title + body from active 61-2-1 fixture', () => {
  const html = loadFixture('section-61-2-1-sample.html');
  const parsed = parseSection(html, '61-2-1');
  assert.ok(parsed, 'parser returned null on real active fixture');
  assert.ok(parsed.titleText, 'titleText empty');
  assert.match(parsed.titleText, /murder/i);
  assert.ok(parsed.bodyText, 'bodyText empty');
  assert.ok(parsed.bodyText.length >= 30, `bodyText too short: ${parsed.bodyText.length}`);
  assert.match(parsed.bodyText, /Murder/);
  assert.equal(parsed.effectiveDate, null);
});

test('parseSection returns null on repealed shell (61-2-17, no <h4> heading)', () => {
  const html = loadFixture('section-61-2-17-repealed.html');
  const parsed = parseSection(html, '61-2-17');
  assert.equal(parsed, null, 'repealed shell with no <h4> heading must return null');
});

test('parseSection returns null on too-short HTML (defensive)', () => {
  assert.equal(parseSection('<html></html>', '61-2-1'), null);
});

test('parseSection returns null when section number mismatches heading', () => {
  const html = loadFixture('section-61-2-1-sample.html');
  const parsed = parseSection(html, '61-2-99'); // wrong section num
  assert.equal(parsed, null, 'mismatched section num must return null');
});

test('parseSection accepts case-insensitive section number match (URL slug uppercase, heading lowercase)', () => {
  const html = loadFixture('section-61-2-1-sample.html');
  // Heading is "§61-2-1." — descriptor "61-2-1" should match regardless of case.
  const parsed = parseSection(html, '61-2-1');
  assert.ok(parsed);
});

test('parseSection output shape is {titleText, bodyText, effectiveDate}', () => {
  const html = loadFixture('section-61-2-1-sample.html');
  const parsed = parseSection(html, '61-2-1');
  assert.ok(parsed);
  assert.deepEqual(
    Object.keys(parsed).sort(),
    ['bodyText', 'effectiveDate', 'titleText'],
  );
});

// ── Adapter: bucketBParse ──────────────────────────────────────────────

test('bucketBParse extracts title + body from active 61-2-1 fixture', () => {
  const html = loadFixture('section-61-2-1-sample.html');
  const parsed = bucketBParse(html, '61-2-1');
  assert.ok(parsed, 'adapter parser returned null on real fixture');
  assert.ok(parsed.titleText);
  assert.ok(parsed.bodyText);
  assert.ok(parsed.bodyText.length >= 30);
});

test('bucketBParse returns null on repealed shell', () => {
  const html = loadFixture('section-61-2-17-repealed.html');
  const parsed = bucketBParse(html, '61-2-17');
  assert.equal(parsed, null);
});

test('bucketBParse output shape is {titleText, bodyText} (no effectiveDate leakage)', () => {
  const html = loadFixture('section-61-2-1-sample.html');
  const parsed = bucketBParse(html, '61-2-1');
  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed).sort(), ['bodyText', 'titleText']);
});

// ── 2-pass: prefetchArticleTocs + sync discoverSections ─────────────────

test('prefetchArticleTocs aggregates per-article HTML via injected fetchArticle stub', async () => {
  const chapterToc = loadFixture('chapter61-toc-sample.html');
  const article2Toc = loadFixture('article61-2-toc-sample.html');
  const fetchArticle = async (articleId) => {
    if (articleId === '2') return article2Toc;
    return '';
  };
  const tocs = await prefetchArticleTocs(chapterToc, '61', fetchArticle);
  assert.ok(tocs instanceof Map);
  assert.ok(tocs.has('2'));
  assert.equal(tocs.get('2'), article2Toc);
});

test('prefetchArticleTocs throws when fetchArticle is missing', async () => {
  const chapterToc = loadFixture('chapter61-toc-sample.html');
  await assert.rejects(
    () => prefetchArticleTocs(chapterToc, '61', null),
    /fetchArticle/,
  );
});

test('prefetchArticleTocs gracefully skips articles whose fetcher throws', async () => {
  const chapterToc = loadFixture('chapter61-toc-sample.html');
  const article2Toc = loadFixture('article61-2-toc-sample.html');
  const fetchArticle = async (articleId) => {
    if (articleId === '2') return article2Toc;
    throw new Error('simulated fetch failure');
  };
  const tocs = await prefetchArticleTocs(chapterToc, '61', fetchArticle);
  // Article 2 succeeded; others threw → not in the map.
  assert.ok(tocs.has('2'));
  assert.ok(!tocs.has('1')); // article 1 fetch threw
});

test('discoverSections (sync) aggregates sections from pre-loaded articleTocs Map', () => {
  const chapterToc = loadFixture('chapter61-toc-sample.html');
  const article2Toc = loadFixture('article61-2-toc-sample.html');
  const config = buildChapterConfig('61');
  config.articleTocs = new Map([['2', article2Toc]]);
  const descriptors = discoverSections(chapterToc, config);
  assert.ok(descriptors.length >= 20, `expected ≥20 descriptors, got ${descriptors.length}`);
  for (const d of descriptors.slice(0, 5)) {
    assert.ok(d.sectionNum, 'sectionNum missing');
    assert.ok(d.sectionUrl, 'sectionUrl missing');
    assert.ok(d.sectionUrl.startsWith('https://code.wvlegislature.gov/'));
    assert.equal(d.chapterNum, '61');
    assert.match(d.sectionNum, /^61-2-/, `sectionNum should start with 61-2-, got ${d.sectionNum}`);
  }
});

test('discoverSections dedupes across multiple article TOCs', () => {
  const chapterToc = loadFixture('chapter61-toc-sample.html');
  const article2Toc = loadFixture('article61-2-toc-sample.html');
  const config = buildChapterConfig('61');
  // Same TOC under two different article keys — dedup should keep only one set.
  config.articleTocs = new Map([
    ['2', article2Toc],
    ['3', article2Toc],
  ]);
  const descriptors = discoverSections(chapterToc, config);
  const seen = new Set();
  for (const d of descriptors) {
    assert.ok(!seen.has(d.sectionUrl), `duplicate sectionUrl: ${d.sectionUrl}`);
    seen.add(d.sectionUrl);
  }
});

test('discoverSections returns empty array when articleTocs is missing/empty', () => {
  const chapterToc = loadFixture('chapter61-toc-sample.html');
  const config = buildChapterConfig('61');
  // No articleTocs assigned.
  assert.deepEqual(discoverSections(chapterToc, config), []);
  // Empty map.
  config.articleTocs = new Map();
  assert.deepEqual(discoverSections(chapterToc, config), []);
});
