// Pattern: cl-bulk-data-defensive #19 (csv-bulk-checked annotation in seeder)
// Pattern: no-hallucinated-legal-data — verified HTTPS source URL per row
//
// Parser + URL builders for the West Virginia Code (code.wvlegislature.gov).
//
// Source pattern (verified 2026-05-02):
//   Site:        code.wvlegislature.gov (WordPress + ColdFusion bridge)
//   Sitemap:     https://www.wvlegislature.gov/sitemap.xml (5.4MB; lists all sections)
//   Section URL: https://code.wvlegislature.gov/<chap>-<art>-<sec>/  (HTML — has NO body)
//   Article PDF: https://code.wvlegislature.gov/pdf/<chap>-<art>/    (HTML body served as PDF)
//
// IMPORTANT: section-level HTML pages render the statute body as a PNG image
// (codeimg.php), not as text. The PDF endpoint at /pdf/<chap>-<art>/ is the
// only structured-text source. One PDF bundles every section in that article.
//
// PDF text shape (after pdf-parse):
//
//   West Virginia Code §61-2
//   Month D, YYYY Page 1 of 60 §61-2
//   WEST VIRGINIA CODE CHAPTER 61
//   ARTICLE 2
//   WV Legislature
//   -- 1 of 60 --
//   West Virginia Code §61-2
//   Month D, YYYY Page 2 of 60 §61-2
//   §61-2-1. First and second degree murder defined; ...
//   <body paragraphs>
//   WV Legislature
//   -- 2 of 60 --
//   West Virginia Code §61-2
//   ...
//   §61-2-2. Penalty for murder of first degree.
//   <body paragraphs>
//   ...

// ---------------------------------------------------------------------------
// Sitemap → article URL discovery
// ---------------------------------------------------------------------------

const SITEMAP_URL = 'https://www.wvlegislature.gov/sitemap.xml';

/**
 * Parse the WV Legislature sitemap.xml and return article-level URLs for the
 * given chapter. Article URLs match `code.wvlegislature.gov/<chap>-<art>/` with
 * `<art>` being a single segment (no further dashes) — section URLs (which have
 * an additional `-<sec>` segment) are excluded here because we ingest at the
 * article-PDF level, not per section.
 *
 * @param {string} sitemapXml
 * @param {string} chapter   e.g. "61"
 * @returns {string[]} article HTML URLs (used to derive PDF URLs)
 */
export function parseArticleUrlsFromSitemap(sitemapXml, chapter) {
  if (typeof sitemapXml !== 'string') return [];
  const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const out = [];
  for (const u of locs) {
    let parsed;
    try { parsed = new URL(u); } catch { continue; }
    if (parsed.hostname.toLowerCase() !== 'code.wvlegislature.gov') continue;
    if (parsed.protocol !== 'https:') continue;
    const segs = parsed.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    if (segs.length !== 1) continue;
    const parts = segs[0].split('-');
    // Article shape: "<chapter>-<artCode>" — exactly 2 parts.
    if (parts.length !== 2) continue;
    if (parts[0] !== chapter) continue;
    out.push(u);
  }
  return out;
}

/**
 * Convert an article HTML URL to its PDF URL.
 *
 *   https://code.wvlegislature.gov/61-2/  ->  https://code.wvlegislature.gov/pdf/61-2/
 *
 * @param {string} articleUrl
 * @returns {string}
 */
export function buildArticlePdfUrl(articleUrl) {
  const u = new URL(articleUrl);
  const segs = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  if (segs.length !== 1) {
    throw new Error(`buildArticlePdfUrl: not an article URL: ${articleUrl}`);
  }
  // Article path shape is "<chapter>-<artCode>" — exactly two dash-parts.
  // "61-2-1" (section) has three; "" (root) has zero.
  const parts = segs[0].split('-');
  if (parts.length !== 2) {
    throw new Error(`buildArticlePdfUrl: not an article URL: ${articleUrl}`);
  }
  return `${u.protocol}//${u.host}/pdf/${segs[0]}/`;
}

/**
 * Build the canonical authoritative section URL for a given chapter/article/section.
 * The section page itself is image-based, but it's the public-facing canonical
 * landing page and what gets cited as the source of record.
 *
 * @param {string} chapter
 * @param {string} articleCode
 * @param {string} sectionId
 * @returns {string}
 */
export function buildCanonicalSectionUrl(chapter, articleCode, sectionId) {
  return `https://code.wvlegislature.gov/${chapter}-${articleCode}-${sectionId}/`;
}

// ---------------------------------------------------------------------------
// PDF text → sections
// ---------------------------------------------------------------------------

const HEADING_LINE_RE = /^§(\d+)-([0-9A-Za-z]+)-([0-9A-Za-z]+)\.\s*(.*)$/;
const PAGE_HEADER_RE = /^West Virginia Code §\d+-[0-9A-Za-z]+$/;
const PAGE_DATE_RE = /^[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+Page\s+\d+\s+of\s+\d+\s+§\d+-[0-9A-Za-z]+$/;
const ARTICLE_HEADER_RE = /^WEST VIRGINIA CODE CHAPTER\s+\d+$/;
const ARTICLE_LABEL_RE = /^ARTICLE\s+[0-9A-Za-z]+(\.|\b)/;
const PAGE_FOOTER_WV_RE = /^WV Legislature$/;
const PAGE_FOOTER_DASH_RE = /^--\s+\d+\s+of\s+\d+\s+--$/;

/**
 * Strip page-chrome lines (running headers/footers) from a PDF text run.
 *
 * Removes:
 *   "West Virginia Code §61-2"
 *   "May 3, 2026 Page 7 of 60 §61-2"
 *   "WEST VIRGINIA CODE CHAPTER 61"
 *   "ARTICLE 2"
 *   "WV Legislature"
 *   "-- 7 of 60 --"
 *   blank lines after the strip
 *
 * @param {string[]} lines
 * @returns {string[]}
 */
export function stripPageChrome(lines) {
  return lines.filter((raw) => {
    const line = raw.trim();
    if (!line) return false;
    if (PAGE_HEADER_RE.test(line)) return false;
    if (PAGE_DATE_RE.test(line)) return false;
    if (ARTICLE_HEADER_RE.test(line)) return false;
    if (ARTICLE_LABEL_RE.test(line)) return false;
    if (PAGE_FOOTER_WV_RE.test(line)) return false;
    if (PAGE_FOOTER_DASH_RE.test(line)) return false;
    return true;
  });
}

/**
 * Detect a section heading and return its parts, or null.
 * Heading shape: "§<chap>-<art>-<sec>. <title>"
 * Sometimes the title text wraps across multiple lines — we capture only the
 * first heading line here; trailing wrapped portions are absorbed by the body
 * collector and re-attached.
 *
 * @param {string} line  trimmed
 * @returns {{ chapter: string, articleCode: string, sectionId: string, headingTail: string }|null}
 */
export function parseHeading(line) {
  const m = HEADING_LINE_RE.exec(line);
  if (!m) return null;
  return {
    chapter: m[1],
    articleCode: m[2],
    sectionId: m[3].toLowerCase(),
    headingTail: m[4].trim(),
  };
}

/**
 * @typedef {Object} WvParsedSection
 * @property {string} chapter
 * @property {string} articleCode
 * @property {string} sectionId       lowercase canonical
 * @property {string} titleText       full heading line incl. trailing wrap
 * @property {string} bodyText        joined paragraphs
 */

/**
 * Parse a full article-PDF text run into an array of sections.
 *
 * @param {string} pdfText  output of `new PDFParse({data}).getText().text`
 * @param {{ chapter?: string, articleCode?: string }} [ctx]  optional sanity hints
 * @returns {WvParsedSection[]}
 */
export function parseArticlePdfText(pdfText, ctx = {}) {
  if (typeof pdfText !== 'string' || pdfText.length === 0) return [];
  const rawLines = pdfText.split(/\r?\n/);
  const lines = stripPageChrome(rawLines);

  const sections = [];
  let current = null;
  let bufferLines = [];

  function commit() {
    if (!current) return;
    // Body = bufferLines joined; lone dash-only / footnote lines already filtered.
    const bodyText = bufferLines.join('\n').trim();
    current.bodyText = bodyText;
    sections.push(current);
    current = null;
    bufferLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = parseHeading(line);
    if (heading) {
      // Sanity: chapter/article match if hints provided.
      if (ctx.chapter && heading.chapter !== ctx.chapter) continue;
      if (ctx.articleCode && heading.articleCode.toLowerCase() !== ctx.articleCode.toLowerCase()) continue;
      commit();
      current = {
        chapter: heading.chapter,
        articleCode: heading.articleCode,
        sectionId: heading.sectionId,
        titleText: line.trim(), // raw heading line, body collector may extend
        bodyText: '',
      };
      continue;
    }
    if (current) bufferLines.push(line);
    // Lines before the first heading (TOC, article cover) are dropped.
  }
  commit();

  // Heading-line wrap heal: WV PDFs sometimes wrap long titles across two lines
  // before the first body paragraph. Detect "headingTail empty OR trailing
  // semicolon AND first body line lowercase-start" and merge.
  for (const s of sections) {
    const firstBodyNl = s.bodyText.indexOf('\n');
    const firstBodyLine = firstBodyNl > -1 ? s.bodyText.slice(0, firstBodyNl) : s.bodyText;
    const titleEndsContinuation = /[;:,]$/.test(s.titleText) || s.titleText.endsWith('.');
    const firstBodyLooksLikeWrap = firstBodyLine.length > 0 && /^[a-z(]/.test(firstBodyLine);
    if (titleEndsContinuation && firstBodyLooksLikeWrap) {
      s.titleText = `${s.titleText.replace(/[.;:,]$/, '')} ${firstBodyLine.trim()}`.trim();
      s.bodyText = firstBodyNl > -1 ? s.bodyText.slice(firstBodyNl + 1) : '';
    }
  }

  return sections;
}
