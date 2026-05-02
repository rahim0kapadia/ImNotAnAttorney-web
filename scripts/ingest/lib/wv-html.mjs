// HTML parsing helpers for code.wvlegislature.gov West Virginia Code Chapter 61
// (Crimes and Their Punishment).
//
// Live structure verified 2026-05-02 against:
//   https://code.wvlegislature.gov/61/         (chapter index — 16 articles)
//   https://code.wvlegislature.gov/61-2/       (article TOC — sections inline)
//   https://code.wvlegislature.gov/61-2-1/     (active section)
//   https://code.wvlegislature.gov/61-2-17/    (repealed section)
//
// Robots: code.wvlegislature.gov has no Crawl-delay (verified 2026-05-02).
// Authoritative source URLs use code.wvlegislature.gov directly — official
// publisher (West Virginia Legislature, hosted via WordPress "Decree" theme).
//
// 3-LEVEL TRAVERSAL (chapter → article → section):
//   WV publishes Chapter 61 across ~16 articles (1-16 with letter suffixes
//   like 8B, 8D, 11A, 12B). The harness contract expects a single
//   discoverSections(html, config) call returning all per-section descriptors,
//   so this lib exports a 2-pass discoverSectionUrls() that:
//     1. Parses the chapter TOC for article URLs (16 articles).
//     2. Fetches each article TOC inline and aggregates section URLs.
//
// Pure in-memory string processing — no file I/O in this module. Mirrors
// fl-html.mjs / oh-html.mjs / mn-html.mjs / ma-html.mjs. No regex on file
// contents (regex runs only on already-loaded HTML strings, not files).

const WV_BASE_URL = 'https://code.wvlegislature.gov';
export const WV_BASE = WV_BASE_URL;

// ── Decode entities ─────────────────────────────────────────────────────────
export function decodeEntities(s) {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x27;/gi, "'")
    .replace(/&sect;|&#xa7;|&#167;/gi, '§')
    .replace(/&#8211;|&#x2013;/gi, '-')
    .replace(/&#8212;|&#x2014;/gi, '-')
    .replace(/&#8216;|&#8217;|&#x2018;|&#x2019;/gi, "'")
    .replace(/&#8220;|&#8221;|&#x201C;|&#x201D;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      if (!Number.isInteger(code) || code < 0 || code > 0x10FFFF) return '';
      if (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) return '';
      if (code === 0x7F) return '';
      if (code >= 0xD800 && code <= 0xDFFF) return '';
      return String.fromCodePoint(code);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = Number.parseInt(n, 16);
      if (!Number.isInteger(code) || code < 0 || code > 0x10FFFF) return '';
      if (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) return '';
      if (code === 0x7F) return '';
      if (code >= 0xD800 && code <= 0xDFFF) return '';
      return String.fromCodePoint(code);
    });
}

// ── Strip tags ─────────────────────────────────────────────────────────────
export function stripHtml(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n\n');
  s = s.replace(/<\/h4>/gi, ' ');
  s = s.replace(/<\/div>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  // Drop control chars except \t \n \r
  s = s.split('').filter((ch) => {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13) return true;
    if (c < 32) return false;
    if (c === 127) return false;
    return true;
  }).join('');
  return s.split(/\s+/).filter(Boolean).join(' ').trim();
}

// ── URL builders ───────────────────────────────────────────────────────────

/**
 * Build chapter TOC URL.
 * @param {string|number} chapter e.g. 61
 * @returns {string}
 */
export function buildChapterUrl(chapter) {
  return `${WV_BASE_URL}/${chapter}/`;
}

/**
 * Build article TOC URL.
 * @param {string|number} chapter e.g. 61
 * @param {string} articleId e.g. "2", "8B", "12A"
 * @returns {string}
 */
export function buildArticleUrl(chapter, articleId) {
  return `${WV_BASE_URL}/${chapter}-${articleId}/`;
}

/**
 * Build the authoritative section URL for a WV statute section number.
 * WV section IDs use hyphens (e.g. "61-2-1", "61-2-9a", "61-2-14d").
 *
 * Live URLs use uppercased letter suffix (`/61-2-9A/`, `/61-2-14D/`) but the
 * displayed section heading uses lowercase (`§61-2-9a`). We canonicalize on
 * lowercase for sectionNum storage and uppercase the URL slug to match the
 * actual host's URL casing.
 *
 * @param {string} sectionNum e.g. "61-2-1", "61-2-9a"
 * @returns {string}
 */
export function buildWVSourceUrl(sectionNum) {
  return `${WV_BASE_URL}/${sectionUrlSlug(sectionNum)}/`;
}

/**
 * Convert section number to URL slug form (uppercase letter suffix to match
 * code.wvlegislature.gov URL casing). 61-2-9a → 61-2-9A.
 *
 * @param {string} sectionNum
 * @returns {string}
 */
export function sectionUrlSlug(sectionNum) {
  return sectionNum.replace(/([0-9])([a-z])$/i, (_, d, l) => `${d}${l.toUpperCase()}`);
}

// ── Article TOC discovery (chapter index) ──────────────────────────────────

// Chapter TOC anchor: <div class='art-head' id='ah-2'><a href='/61-2/'>ARTICLE 2. ...</a></div>
const RX_WV_ARTICLE_LINK =
  /<div\s+class=['"]art-head['"]\s+id=['"]ah-([0-9A-Za-z]+)['"]>\s*<a\s+href=['"]\/(\d+)-([0-9A-Za-z]+)\/['"][^>]*>/gi;

/**
 * Discover article URLs from the chapter TOC HTML.
 *
 * @param {string} html        Chapter TOC HTML
 * @param {string|number} chapter  e.g. 61
 * @returns {Array<{articleId: string, articleUrl: string}>}
 */
export function discoverArticleUrls(html, chapter) {
  if (!html) return [];
  const chap = String(chapter);
  const seen = new Set();
  const out = [];

  RX_WV_ARTICLE_LINK.lastIndex = 0;
  let m;
  while ((m = RX_WV_ARTICLE_LINK.exec(html)) !== null) {
    const ahId = m[1];           // e.g. "2", "8B"
    const chapMatch = m[2];      // e.g. "61"
    const artInUrl = m[3];       // e.g. "2", "8B"
    if (chapMatch !== chap) continue;
    if (ahId !== artInUrl) continue;  // sanity: id-suffix must match URL slug
    const articleUrl = `${WV_BASE_URL}/${chap}-${artInUrl}/`;
    if (seen.has(articleUrl)) continue;
    seen.add(articleUrl);
    out.push({ articleId: artInUrl, articleUrl });
  }
  return out;
}

// ── Section TOC discovery (article index) ─────────────────────────────────

// Article TOC section row:
//   <div class='sec-head' data-id='ah-2'><a href='/61-2-1/'>§61-2-1. headnote.</a></div>
//   <div class='sec-head' data-id='ah-2'><a href='/61-2-9A/'>§61-2-9a. headnote.</a></div>
//   <div class='sec-head' data-id='ah-2'><a href='/61-2-17/'>§61-2-17 Repealed Acts...</a></div>  ← skip via "Repealed" keyword
const RX_WV_SECTION_ROW = /<div\s+class=['"]sec-head['"][^>]*>([\s\S]*?)<\/div>/gi;
const RX_WV_SECTION_ANCHOR =
  /<a\s+href=['"]\/(\d+)-([0-9A-Za-z]+)-([0-9A-Za-z]+)\/['"][^>]*>([\s\S]*?)<\/a>/i;
// Match "Repealed" anywhere in the anchor's inner text — case-insensitive.
const RX_WV_REPEALED_KEYWORD = /\brepealed\b/i;

/**
 * Discover section URLs within ONE article TOC HTML.
 *
 * Filters out repealed sections by detecting the "Repealed" keyword in the
 * anchor text — repealed sections render as
 *   <a href='/61-2-17/'>§61-2-17\nRepealed\nActs, 2017 Reg. Sess., Ch. 129.</a>
 * with no actionable body, just a stub. Saves a polite-delay sleep per repealed
 * section (and matches MN's TOC inactive filter pattern).
 *
 * @param {string} html        Article TOC HTML (article page response)
 * @param {string|number} chapter  e.g. 61
 * @param {string} articleId   e.g. "2", "8B"
 * @returns {string[]}  absolute URLs (https://code.wvlegislature.gov/61-{ART}-{S}/)
 */
export function discoverSectionUrlsForArticle(html, chapter, articleId) {
  if (!html) return [];
  const chap = String(chapter);
  const art = String(articleId);
  const seen = new Set();
  const out = [];

  RX_WV_SECTION_ROW.lastIndex = 0;
  let m;
  while ((m = RX_WV_SECTION_ROW.exec(html)) !== null) {
    const rowHtml = m[1];
    if (!rowHtml) continue;
    const am = rowHtml.match(RX_WV_SECTION_ANCHOR);
    if (!am) continue;
    const chapMatch = am[1];
    const artMatch = am[2];
    const secSlug = am[3];           // URL casing — may be "9A"
    const anchorInner = am[4] || '';
    if (chapMatch !== chap) continue;
    if (artMatch !== art) continue;
    if (RX_WV_REPEALED_KEYWORD.test(stripHtml(anchorInner))) continue;
    const url = `${WV_BASE_URL}/${chap}-${art}-${secSlug}/`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Extract the section number from a section URL.
 *   /61-2-1/    → "61-2-1"
 *   /61-2-9A/   → "61-2-9a"   (lowercase letter suffix, canonical form)
 *   /61-2-14D/  → "61-2-14d"
 *
 * @param {string} sectionUrl
 * @returns {string}
 */
export function sectionIdFromUrl(sectionUrl) {
  const m = sectionUrl.match(/\/(\d+)-([0-9A-Za-z]+)-([0-9A-Za-z]+)\/?$/);
  if (!m) throw new Error(`sectionIdFromUrl: cannot parse ${sectionUrl}`);
  // Lowercase trailing letter on the section slug (URL is uppercase-suffixed,
  // canonical citation is lowercase: §61-2-9a, §61-2-14d).
  const sec = m[3].replace(/([0-9])([A-Z])$/, (_, d, l) => `${d}${l.toLowerCase()}`);
  return `${m[1]}-${m[2]}-${sec}`;
}

/**
 * Article ID from section URL.
 *   /61-2-1/   → "2"
 *   /61-8B-3/  → "8B"
 *
 * @param {string} sectionUrl
 * @returns {string}
 */
export function articleIdFromUrl(sectionUrl) {
  const m = sectionUrl.match(/\/(\d+)-([0-9A-Za-z]+)-([0-9A-Za-z]+)\/?$/);
  if (!m) throw new Error(`articleIdFromUrl: cannot parse ${sectionUrl}`);
  return m[2];
}

// ── Section page parser ────────────────────────────────────────────────────

// Active section body: <div class='sectiontext hid'><h4>§61-2-1. headnote.</h4><p>...</p>...</div>
// Repealed section body: <div class='sectiontext hid'><p>§61-2-17</p><p>Repealed</p><p>...</p></div>
//   (no <h4> heading → must return null)
const RX_WV_SECTIONTEXT =
  /<div\s+class=['"]sectiontext\s+hid['"][^>]*>([\s\S]*?)<\/div>/i;

// Heading inside sectiontext: <h4>§61-2-1. First and second degree murder defined; ...</h4>
// Section number can include lowercase letter suffix: §61-2-9a, §61-2-14d
const RX_WV_HEADING_H4 =
  /<h4[^>]*>\s*§\s*(\d+-[0-9A-Za-z]+-[0-9A-Za-z]+)\.\s*([\s\S]*?)<\/h4>/i;

/**
 * Parse a code.wvlegislature.gov section page.
 *
 * Returns {titleText, bodyText, effectiveDate} for active sections;
 * null for repealed shells (no <h4> heading inside .sectiontext).
 *
 * Two structural variants observed 2026-05-02:
 *   1. Active section: <div class='sectiontext hid'><h4>§N. HEADNOTE.</h4><p>body</p>…</div>
 *      → return real headnote + body text
 *   2. Repealed shell: <div class='sectiontext hid'><p>§N</p><p>Repealed</p><p>Acts...</p></div>
 *      → no <h4> → return null (TOC filter should already have dropped these)
 *
 * Also returns null when:
 *   - .sectiontext block missing entirely (page not as expected)
 *   - heading section number doesn't match the descriptor (parser drift guard)
 *   - body text < 30 chars (real WV sections are well above this floor)
 *
 * @param {string} html
 * @param {string} sectionNum  canonical lowercase form, e.g. "61-2-1", "61-2-9a"
 * @returns {{titleText: string, bodyText: string, effectiveDate: null}|null}
 */
export function parseSection(html, sectionNum) {
  if (!html || html.length < 500) return null;

  // Locate the .sectiontext block — body container for both active and
  // repealed shells.
  const stMatch = html.match(RX_WV_SECTIONTEXT);
  if (!stMatch) return null;
  const sectionTextHtml = stMatch[1];
  if (!sectionTextHtml) return null;

  // Variant 2: repealed shell — no <h4> heading. Skip.
  const headMatch = sectionTextHtml.match(RX_WV_HEADING_H4);
  if (!headMatch) return null;

  const headingNumber = headMatch[1].toLowerCase();
  const expected = sectionNum.toLowerCase();
  if (headingNumber !== expected) {
    // Heading section number doesn't match descriptor — treat as parse error
    // (safer than silently writing the wrong section).
    return null;
  }

  let titleText = stripHtml(headMatch[2]).trim();
  // Strip trailing period (WV formats headnotes with terminal period).
  titleText = titleText.replace(/\.$/, '').trim();

  // Body is the .sectiontext content with the <h4> removed.
  const bodyHtml = sectionTextHtml.replace(RX_WV_HEADING_H4, ' ');
  const bodyText = stripHtml(bodyHtml);

  // Sanity: body must be substantial. Real WV sections are >80 chars even for
  // the shortest definitions; <30 likely means parse drift or a stub page.
  if (!bodyText || bodyText.length < 30) return null;

  // If we somehow got body without a headnote, fall back to a synthetic one
  // (matches MN/MA pattern for graceful degradation).
  if (!titleText) titleText = `Section ${sectionNum}`;

  return { titleText, bodyText, effectiveDate: null };
}

// ── Bucket-B harness adapter — 2-pass discovery ────────────────────────────

/**
 * Pre-fetch all article TOC HTML for a chapter so the harness's sync
 * discoverSections() contract can be honored.
 *
 * Bucket-B harness signature is `(tocHtml, config) → Descriptor[]` (sync).
 * WV's 3-level traversal (chapter → article → section) requires a per-article
 * fetch pass. The seeder must pre-warm `config.articleTocs` (Map<articleId,
 * html>) BEFORE calling `ingestBucketBState`, then `discoverSections` is a
 * pure-sync aggregator over the pre-loaded TOCs.
 *
 * @param {string} chapterTocHtml         Chapter index HTML (already fetched)
 * @param {string|number} chapter         e.g. "61"
 * @param {(articleId: string, articleUrl: string) => Promise<string>} fetchArticle
 *   Async fetcher injected by the seeder. Live runs: `fetchWithRetry`+sleep.
 *   Tests: stub returning pre-loaded fixture HTML.
 * @returns {Promise<Map<string, string>>} articleId → article TOC HTML
 */
export async function prefetchArticleTocs(chapterTocHtml, chapter, fetchArticle) {
  if (typeof fetchArticle !== 'function') {
    throw new Error('wv-html.prefetchArticleTocs: fetchArticle async function is required');
  }
  const chap = String(chapter);
  const articles = discoverArticleUrls(chapterTocHtml, chap);
  const tocs = new Map();
  for (const { articleId, articleUrl } of articles) {
    let articleHtml;
    try {
      articleHtml = await fetchArticle(articleId, articleUrl);
    } catch (err) {
      console.warn(`  [wv-html] article ${articleId} fetch failed: ${err.message}`);
      continue;
    }
    if (!articleHtml) continue;
    tocs.set(articleId, articleHtml);
  }
  return tocs;
}

/**
 * Bucket-B harness contract: discoverSections(tocHtml, config) returns
 * an array of {sectionNum, sectionUrl, chapterNum} descriptors. Sync.
 *
 * Pass-2 article TOCs must already be in `config.articleTocs` (Map). The
 * seeder pre-fetches them via `prefetchArticleTocs` BEFORE invoking the
 * harness, since the harness contract is synchronous.
 *
 * If `config.articleTocs` is missing, this falls back to the chapter TOC
 * alone — useful for negative-path tests but yields zero sections.
 *
 * @param {string} chapterTocHtml  Chapter TOC HTML (already fetched by harness)
 * @param {object} config          BucketBStateConfig with articleTocs Map
 * @returns {Array<{sectionNum: string, sectionUrl: string, chapterNum: string}>}
 */
export function discoverSections(chapterTocHtml, config) {
  if (!config) return [];
  const chap = String(config.titleNum);
  const tocs = config.articleTocs;
  if (!tocs || !(tocs instanceof Map) || tocs.size === 0) {
    // No pre-loaded article TOCs — return empty (seeder must call
    // prefetchArticleTocs first and assign to config.articleTocs).
    return [];
  }

  const seen = new Set();
  const out = [];
  // Iterate articles in chapter-TOC order so the descriptor list reflects the
  // canonical chapter sequence (helps debugging / verbose logs).
  const articles = discoverArticleUrls(chapterTocHtml, chap);
  for (const { articleId } of articles) {
    const articleHtml = tocs.get(articleId);
    if (!articleHtml) continue;
    const urls = discoverSectionUrlsForArticle(articleHtml, chap, articleId);
    for (const u of urls) {
      if (seen.has(u)) continue;
      seen.add(u);
      out.push({
        sectionNum: sectionIdFromUrl(u),
        sectionUrl: u,
        chapterNum: chap,
      });
    }
  }
  return out;
}
