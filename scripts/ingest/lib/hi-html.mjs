// Template: scripts/ingest/lib/mn-html.mjs (Bucket B per-section parser pattern)
// Pattern: bucket-b-html.mjs harness contract
// Pattern: cl-bulk-data-defensive #18 — pure string ops, no file I/O
//
// HTML parsing helpers for capitol.hawaii.gov hrscurrent (Hawaii Revised
// Statutes — Title 37 Penal Code plus Chapter 134 Firearms cohort).
//
// Architectural invariant #13 (Verification-URL HARD rule): every row stores
// the authoritative capitol.hawaii.gov per-section URL in source_urls[]. The
// parser never fabricates: if the title and body cannot be extracted from the
// real fetched HTML, the section is skipped (parser returns null).
// Target table: entities_statutes (NOT deprecated jurisdiction_statutes,
// per MEMORY.md Lesson 6, hook-enforced via enforce-entities-statutes-table.js).
//
// Live structure verified 2026-05-02 against:
//   https://www.capitol.hawaii.gov/hrscurrent/Vol14_Ch0701-0853/HRS0701/HRS_0701-.htm
//   https://www.capitol.hawaii.gov/hrscurrent/Vol14_Ch0701-0853/HRS0707/HRS_0707-0701.htm
//   https://www.capitol.hawaii.gov/hrscurrent/Vol03_Ch0121-0200D/HRS0134/HRS_0134-.htm
//   https://www.capitol.hawaii.gov/hrscurrent/Vol03_Ch0121-0200D/HRS0134/HRS_0134-0002_0005.htm
//   https://www.capitol.hawaii.gov/hrscurrent/Vol14_Ch0701-0853/HRS0712A/HRS_0712A-.htm
//
// Cloudflare-fronted: Chrome User-Agent header MANDATORY. Default UA in
// bucket-b-html.fetchWithRetry returns 403 for capitol.hawaii.gov; HI seeder
// config overrides via the userAgent option on the BucketBStateConfig.
//
// Robots: capitol.hawaii.gov serves no Crawl-delay; J1 Justia rule (cached
// from MEMORY.md reference-justia-cloudflare-rate-limits-2026-05-01) mandates
// 1.5 second polite delay (set in seed-statutes-hi-title37.mjs as
// crawlDelayMs=1500).
//
// HRS publishing is Microsoft Word 15 filtered output. Section text lives in
// <p class="RegularParagraphs"> paragraphs. Cross-references and editor's
// notes live in <p class="XNotes"> and <p class="XNotesHeading"> — these are
// editorial commentary, not the statute, and MUST be stripped before hashing
// per no-hallucinated-legal-data rule (we store the statute text only).
//
// Section title format: leading <b> tag immediately after the section number,
// for example  <b>§707-701  Murder in the first degree.</b>  (1) and so on
// or bracketed:  <b>[§134-2.5  Permits for motion picture films]</b>  (a)
// We extract the title from the <b> span and strip section sign and brackets.
//
// Pure in-memory string processing — no file I/O in this module. Mirrors
// mn-html.mjs / fl-html.mjs / oh-html.mjs / ma-html.mjs structurally.

const HI_BASE_URL = 'https://www.capitol.hawaii.gov';
export const HI_BASE = HI_BASE_URL;

// Chapter-to-Volume mapping for the Title 37 plus Chapter 134 cohort.
// Verified 2026-05-02 via direct HTTP HEAD probes (cf-cache-status: HIT).
export const HI_CHAPTER_VOLUMES = {
  '134':   'Vol03_Ch0121-0200D',
  '701':   'Vol14_Ch0701-0853',
  '702':   'Vol14_Ch0701-0853',
  '703':   'Vol14_Ch0701-0853',
  '704':   'Vol14_Ch0701-0853',
  '705':   'Vol14_Ch0701-0853',
  '706':   'Vol14_Ch0701-0853',
  '707':   'Vol14_Ch0701-0853',
  '708':   'Vol14_Ch0701-0853',
  '708A':  'Vol14_Ch0701-0853',
  '709':   'Vol14_Ch0701-0853',
  '710':   'Vol14_Ch0701-0853',
  '711':   'Vol14_Ch0701-0853',
  '712':   'Vol14_Ch0701-0853',
  '712A':  'Vol14_Ch0701-0853',
};

// Decode HTML entities

/**
 * Decode common HTML named and numeric entities found in capitol.hawaii.gov
 * HRS pages. Strict against control characters, surrogate codepoints, and
 * out-of-range codepoints to avoid emitting invalid UTF-8 into section_text.
 *
 * @param {string} s
 * @returns {string}
 */
export function decodeEntities(s) {
  if (!s) return '';
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

// Strip HTML tags

/**
 * Strip script and style blocks, comments, and all remaining HTML tags from
 * a string. Convert closing block tags to whitespace separators. Decode HTML
 * entities. Drop control characters except tab, newline, carriage return.
 * Collapse whitespace runs to single spaces and trim.
 *
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n\n');
  s = s.replace(/<\/h[1-6]>/gi, ' ');
  s = s.replace(/<\/div>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.split('').filter((ch) => {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13) return true;
    if (c < 32) return false;
    if (c === 127) return false;
    return true;
  }).join('');
  return s.split(/\s+/).filter(Boolean).join(' ').trim();
}

// URL builders

/**
 * Pad chapter number for URL path. Always 4 digits including any trailing
 * alpha character.
 *
 * Examples:
 *   "134"  becomes "0134"
 *   "712A" becomes "0712A"
 *   "708A" becomes "0708A"
 *
 * @param {string} chapter
 * @returns {string}
 */
export function padChapter(chapter) {
  const m = String(chapter).match(/^(\d+)([A-Z]?)$/);
  if (!m) throw new Error(`invalid HI chapter: ${chapter}`);
  const num = m[1];
  const suffix = m[2];
  if (num.length > 4) throw new Error(`HI chapter numeric > 4 digits: ${chapter}`);
  return num.padStart(4, '0') + suffix;
}

/**
 * Pad section component (major or minor) for URL path. Numeric only,
 * 4 digits.
 *
 * Examples:
 *   "1"   becomes "0001"
 *   "316" becomes "0316"
 *   "9"   becomes "0009"
 *
 * @param {string} part
 * @returns {string}
 */
export function padSectionPart(part) {
  if (!/^\d+$/.test(String(part))) throw new Error(`section part not numeric: ${part}`);
  return String(part).padStart(4, '0');
}

/**
 * Build chapter Table-of-Contents URL.
 *
 * @param {string} chapter for example "707", "134", "712A"
 * @returns {string}
 */
export function buildChapterUrl(chapter) {
  const vol = HI_CHAPTER_VOLUMES[chapter];
  if (!vol) throw new Error(`HI chapter ${chapter} not in HI_CHAPTER_VOLUMES map`);
  const padded = padChapter(chapter);
  return `${HI_BASE_URL}/hrscurrent/${vol}/HRS${padded}/HRS_${padded}-.htm`;
}

/**
 * Build per-section URL.
 *
 * Section number "707-701" becomes the HRS_0707-0701.htm endpoint under
 * Vol14_Ch0701-0853/HRS0707/. Section number "134-1" becomes HRS_0134-0001.htm
 * under Vol03_Ch0121-0200D/HRS0134/. Section number "134-2.5" becomes
 * HRS_0134-0002_0005.htm under the same chapter directory. Section number
 * "712A-5.5" becomes HRS_0712A-0005_0005.htm under Vol14_Ch0701-0853/HRS0712A/.
 * Section number "712A-1" becomes HRS_0712A-0001.htm under the same.
 *
 * The portion left of the dash MAY include a trailing alpha character
 * representing the chapter; the portion right of the dash is "<major>" or
 * "<major>.<minor>", both numeric.
 *
 * @param {string} sectionNum for example "707-701", "134-2.5", "712A-5.5"
 * @returns {string}
 */
export function buildSectionUrl(sectionNum) {
  const m = String(sectionNum).match(/^(\d+[A-Z]?)-(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error(`invalid HI section number: ${sectionNum}`);
  const chapter = m[1];
  const major = m[2];
  const minor = m[3];
  const vol = HI_CHAPTER_VOLUMES[chapter];
  if (!vol) {
    throw new Error(`HI chapter ${chapter} not in HI_CHAPTER_VOLUMES map (sectionNum=${sectionNum})`);
  }
  const chPad = padChapter(chapter);
  const fragMajor = padSectionPart(major);
  const frag = minor !== undefined
    ? `${fragMajor}_${padSectionPart(minor)}`
    : fragMajor;
  return `${HI_BASE_URL}/hrscurrent/${vol}/HRS${chPad}/HRS_${chPad}-${frag}.htm`;
}

/**
 * Authoritative source URL stored in entities_statutes.source_urls[]. Equal
 * to the discovered section URL because capitol.hawaii.gov is the official
 * publisher (Hawaii State Legislature canonical archive of the HRS).
 *
 * @param {string} sectionNum
 * @returns {string}
 */
export function buildHiSourceUrl(sectionNum) {
  return buildSectionUrl(sectionNum);
}

// TOC discovery

/**
 * Parse a chapter Table-of-Contents HTML page and emit section descriptors
 * for the harness to fetch.
 *
 * The HRS ToC is plain-text section enumeration inside
 * <p class="RegularParagraphs"> paragraphs — no <a href> anchors to section
 * pages. Section numbers are extracted via a chapter-anchored regex against
 * the post-strip text, then URLs are constructed from the section number.
 *
 * Section IDs in the ToC look like "    701-100 Title and effective date of
 * amendments" or "   712A-5.5 Excessive forfeitures" or "  134-2.5 Permits
 * for motion picture films".
 *
 * Repealed-section listings remain in the descriptor list; the per-section
 * parser will null them out via the title check.
 *
 * @param {string} tocHtml
 * @param {string} chapter   for example "707", "712A" — used to anchor
 *                           extraction to this chapter only
 * @returns {Array<{sectionNum: string, sectionUrl: string, chapterNum: string}>}
 */
export function discoverSections(tocHtml, chapter) {
  if (!tocHtml || typeof tocHtml !== 'string') return [];
  if (!chapter) throw new Error('discoverSections: chapter is required');

  const text = stripHtml(tocHtml);

  const escapedChapter = chapter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b(${escapedChapter})-(\\d+)(?:\\.(\\d+))?\\b`, 'g');
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const ch = m[1];
    const major = m[2];
    const minor = m[3];
    const sectionNum = minor !== undefined ? `${ch}-${major}.${minor}` : `${ch}-${major}`;
    if (seen.has(sectionNum)) continue;
    seen.add(sectionNum);
    let sectionUrl;
    try {
      sectionUrl = buildSectionUrl(sectionNum);
    } catch {
      continue;
    }
    out.push({ sectionNum, sectionUrl, chapterNum: chapter });
  }
  return out;
}

// Section parser

/**
 * Parse a single section HTML page.
 *
 * Strategy:
 *   Step 1. Extract the WordSection1 div (or fall back to body region).
 *   Step 2. Drop XNotes and XNotesHeading paragraphs (editor's notes and
 *           cross-references — not statute text).
 *   Step 3. Drop RegularParagraphs containing "COMMENTARY" headings
 *           (editorial commentary blocks rendered as RegularParagraphs).
 *   Step 4. Find the title <b> span containing the literal §<sectionNum>
 *           prefix. The section number in the page may have a literal
 *           section-sign prefix and optional surrounding brackets.
 *   Step 5. Body equals everything in the cleaned region after the title
 *           closing tag.
 *   Step 6. Strip section sign and brackets from title. Trim and normalize.
 *
 * Returns null when:
 *   - no title <b> tag matched (404 placeholder, or section does not exist)
 *   - body text empty or too short after stripping (fewer than 8 characters)
 *   - title text begins with "Repealed" (stub section)
 *
 * @param {string} sectionHtml
 * @param {string} sectionNum  for example "707-701", "134-2.5"
 * @returns {{titleText: string, bodyText: string} | null}
 */
export function parseSection(sectionHtml, sectionNum) {
  if (!sectionHtml || typeof sectionHtml !== 'string') return null;
  if (!sectionNum) return null;

  // Extract main WordSection1 container; if missing, fall back to body region.
  const wsm = sectionHtml.match(/<div\s+class\s*=\s*["']WordSection1["'][^>]*>([\s\S]*?)<\/div>\s*<div\s+id\s*=\s*['"]pageLinks/i);
  let region = wsm ? wsm[1] : null;
  if (!region) {
    const wsm2 = sectionHtml.match(/<div\s+class\s*=\s*["']WordSection1["'][^>]*>([\s\S]*?)<\/div>\s*<\/body/i);
    region = wsm2 ? wsm2[1] : sectionHtml;
  }

  // Drop XNotes paragraphs (editor's notes, commentary, cross-references).
  let cleaned = region.replace(/<p\s+class\s*=\s*["']XNotes(?:Heading)?["'][^>]*>[\s\S]*?<\/p>/gi, ' ');
  // Drop COMMENTARY heading paragraphs that sometimes appear as RegularParagraphs.
  cleaned = cleaned.replace(/<p\s+class\s*=\s*["']RegularParagraphs["'][^>]*>\s*(?:<[^>]+>\s*)*COMMENTARY[\s\S]*?<\/p>/gi, ' ');

  // Find the title <b> span containing the section sign and section number.
  const escSec = sectionNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const titleRe = new RegExp(
    `<b[^>]*>\\s*\\[?\\s*(?:&sect;|§)\\s*${escSec}\\b([\\s\\S]*?)<\\/b>`,
    'i',
  );
  const tm = cleaned.match(titleRe);
  if (!tm) return null;

  const rawTitle = stripHtml(tm[1]);
  let titleText = rawTitle.replace(/^[.\s]+/, '').replace(/[\]\.\s]+$/, '').trim();
  titleText = titleText.replace(/^§\s*/, '').trim();
  if (!titleText) return null;

  if (/^repealed\b/i.test(titleText)) return null;

  const titleEnd = tm.index + tm[0].length;
  const afterTitle = cleaned.slice(titleEnd);
  const bodyText = stripHtml(afterTitle);
  if (!bodyText || bodyText.length < 8) return null;

  return { titleText, bodyText };
}
