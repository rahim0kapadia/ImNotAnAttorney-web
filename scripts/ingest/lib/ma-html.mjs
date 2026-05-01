// HTML parsing helpers for malegislature.gov General Laws Part IV Title I
// (Crimes and Punishments, Chapters 263-274).
//
// Live structure verified 2026-05-01 against:
//   https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI            (title index)
//   https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter265 (chapter)
//   https://malegislature.gov/Laws/GeneralLaws/PartIV/TitleI/Chapter265/Section1 (section)
//
// Robots: User-agent: *  Disallow: <empty>  (full crawl allowed, no Crawl-delay)
// Authoritative source URLs use the malegislature.gov domain directly — this
// is the official Office of the Massachusetts General Court publisher.
//
// Pure in-memory string processing — no file I/O in this module (regex on
// in-memory strings, FL pattern). Mirrors fl-html.mjs / oh-html.mjs.

const SECTION_HREF_PATTERN_BASE = '/Laws/GeneralLaws/PartIV/TitleI/Chapter';
export const MA_BASE_URL = 'https://malegislature.gov';

// MA Part IV Title I = chapters 263 through 274 (12 chapters).
// Range hardcoded in malegislature.gov/Laws/GeneralLaws/PartIV/TitleI page text
// ("Chapters 263 - 274"). Chapter listing is AJAX-loaded; can't grep page.
// Chapter 268A (Conduct of Public Officers) sits inside the range; the URL
// uses "Chapter268A" with the A suffix, so we model chapters as strings.
export const MA_CHAPTER_LABELS = ['263', '264', '265', '266', '267', '268', '268A', '269', '270', '271', '272', '274'];

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
 * Build chapter index URL.
 * @param {string|number} chapter e.g. 265 or "268A"
 * @returns {string}
 */
export function buildChapterUrl(chapter) {
  return `${MA_BASE_URL}/Laws/GeneralLaws/PartIV/TitleI/Chapter${chapter}`;
}

/**
 * Build a section URL from chapter + section identifier. Section ID is the
 * text after "Section" in the href, URL-encoded. e.g. "13A", "6 to 8".
 * @param {string|number} chapter
 * @param {string} sectionRaw  raw section ID as it appears in URL (already encoded ok)
 * @returns {string}
 */
export function buildSectionUrl(chapter, sectionRaw) {
  return `${MA_BASE_URL}/Laws/GeneralLaws/PartIV/TitleI/Chapter${chapter}/Section${sectionRaw}`;
}

/**
 * Extract a canonical sectionId for the `section` DB column from a section URL.
 * Format: `<chapter>-<section>` lowercase, URL-decoded, spaces→underscores.
 * Examples:
 *   /Chapter265/Section1                 → "265-1"
 *   /Chapter265/Section13A               → "265-13A"
 *   /Chapter265/Section6%20to%208        → "265-6_to_8"
 *   /Chapter268A/Section1                → "268A-1"
 *
 * @param {string} sectionUrl
 * @returns {string}
 */
export function sectionIdFromUrl(sectionUrl) {
  const m = sectionUrl.match(/\/Chapter([\w]+)\/Section([^/?#]+)/);
  if (!m) throw new Error(`sectionIdFromUrl: cannot parse ${sectionUrl}`);
  const chapter = m[1];
  let section;
  try {
    section = decodeURIComponent(m[2]);
  } catch {
    section = m[2];
  }
  // Normalize: trim, replace whitespace runs with single underscore.
  section = section.trim().split(/\s+/).join('_');
  return `${chapter}-${section}`;
}

// ── Section URL discovery from a chapter index page ────────────────────────

/**
 * Extract section URLs from a chapter index HTML page.
 * Discovery strategy: find every `<a href="/Laws/GeneralLaws/PartIV/TitleI/ChapterN/SectionM">`
 * link where N matches the current chapter context. Dedupes within page.
 *
 * @param {string} html
 * @param {string} chapterUrl  the chapter URL we fetched (provides context)
 * @returns {string[]}  absolute URLs (https://malegislature.gov/...)
 */
export function discoverSectionUrls(html, chapterUrl) {
  if (!html) return [];
  // Pull chapter token from chapterUrl so we don't pick up sibling chapters.
  const cm = chapterUrl.match(/\/Chapter([\w]+)$/);
  if (!cm) return [];
  const chapter = cm[1];

  const seen = new Set();
  const result = [];

  // Match href values referring to this chapter's section pages. Allow %20
  // (encoded spaces) and alphanumerics (e.g. 13A, 6 to 8 → "6%20to%208").
  const hrefPattern = new RegExp(
    `href=["']${SECTION_HREF_PATTERN_BASE}${chapter}/Section([^"'#?]+)["']`,
    'g',
  );
  let m;
  while ((m = hrefPattern.exec(html)) !== null) {
    const sectionRaw = m[1];
    if (!sectionRaw) continue;
    // Skip obvious junk (very long fragments, anything ending in slash).
    if (sectionRaw.length > 80) continue;
    const url = `${MA_BASE_URL}/Laws/GeneralLaws/PartIV/TitleI/Chapter${chapter}/Section${sectionRaw}`;
    if (seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

// ── Section page parser ─────────────────────────────────────────────────────

const RX_MA_SECTION_TITLE = /<h2[^>]*class="[^"]*genLawHeading[^"]*"[^>]*>\s*Section\s+([\w]+(?:\s+to\s+\w+)?)\s*:?\s*<small>([^<]*)<\/small>/i;
const RX_MA_BODY_PARAGRAPHS = /<h2[^>]*class="[^"]*genLawHeading[^"]*"[^>]*>[\s\S]*?<\/h2>([\s\S]*?)(?=<\/div>\s*<\/div>\s*<\/div>\s*<\/div>|<script|<\/section>|<footer)/i;

/**
 * Parse a malegislature.gov section page.
 *
 * Expected structure (verified 2026-05-01):
 *   <h2 id="skipTo" class="h3 genLawHeading hidden-print">Section 1: <small>Murder defined</small>
 *   </h2>
 *   <p><p>Section 1. Murder committed with deliberately premeditated...</p></p>
 *
 * The `Section N. ` prefix in the body is left intact (statutory style;
 * Massachusetts text always starts with "Section N." inside the body).
 *
 * @param {string} html
 * @param {{sectionId: string, sectionUrl: string}} ctx
 * @returns {{titleText: string, bodyText: string, effectiveDate: null}|null}
 */
export function parseSection(html, ctx) {
  if (!html || html.length < 1000) return null;

  // Title.
  let titleText = '';
  const tm = html.match(RX_MA_SECTION_TITLE);
  if (tm) {
    titleText = stripHtml(tm[2]).trim().replace(/\.$/, '').trim();
  }

  // Body. Pull the chunk after the genLawHeading h2; stop at footer/script.
  const bm = html.match(RX_MA_BODY_PARAGRAPHS);
  if (!bm) return null;
  let bodyChunk = bm[1];

  // Drop the `<button … nextButton …>` pagination block if present.
  bodyChunk = bodyChunk.replace(/<div\b[^>]*class="[^"]*btn-group[^"]*"[^>]*>[\s\S]*?<\/div>/gi, ' ');

  const bodyText = stripHtml(bodyChunk);

  // Sanity: body must contain meaningful text. Repealed sections may still
  // have a real one-liner ("Repealed, 1973, 1015, Sec. 1.") which is OK.
  if (!bodyText || bodyText.length < 12) return null;

  if (!titleText) titleText = `Section ${ctx?.sectionId || ''}`.trim();

  return { titleText, bodyText, effectiveDate: null };
}
