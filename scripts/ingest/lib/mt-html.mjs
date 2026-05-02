// HTML parsing helpers for mca.legmt.gov Montana Code Annotated Title 45 (Crimes).
//
// Live structure verified 2026-05-02 against:
//   https://mca.legmt.gov/bills/mca/title_0450/chapters_index.html      (title TOC)
//   https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/parts_index.html
//   https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/sections_index.html
//   https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/section_0020/0450-0050-0010-0020.html
//
// SC-1 RESULT (verified by reading bucket-b-html.mjs:301):
//   `config.discoverSections(tocHtml, config)` is NOT awaited. discoverSections
//   must return the descriptor array synchronously. MT requires a 3-level pre-walk
//   that the harness cannot perform inline. The seeder therefore performs the
//   pre-walk via `fetchWithRetry` BEFORE calling `ingestBucketBState`, builds the
//   descriptor list, and passes a sync `discoverSections` closure that returns
//   the pre-built array. See `seed-statutes-mt-title45.mjs` for the orchestrator.
//
// Akamai bot-challenge prefix (`<APM_DO_NOT_TOUCH>` JS block) is stripped
// defensively in `parseSection`. Server-side rendering still includes the full
// statute body — confirmed via design report 2026-05-02 + WebFetch sampling.
//
// Robots: mca.legmt.gov has no robots.txt (404 verified 2026-05-02). Crawl-delay
// floor is enforced by seeder config at 2500ms (Akamai-conservative).
//
// Authoritative source URLs use mca.legmt.gov directly — this is the official
// publisher (Montana Legislative Services). archive.legmt.gov is historical
// only, not used for current code.
//
// Pure in-memory string processing — no file I/O in this module. Mirrors
// fl-html.mjs / oh-html.mjs / mn-html.mjs. No regex on file contents (regex
// runs only on already-loaded HTML strings, not files).

const MT_BASE_URL = 'https://mca.legmt.gov';
export const MT_BASE = MT_BASE_URL;
const MT_TITLE_ENCODED = '0450'; // Title 45 in MT's 4-char zero-padded shape

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
  // Akamai bot-challenge prefix — strip first so its JS contents don't bleed
  // through any later regex (defense-in-depth; parseSection also strips).
  s = s.replace(/<APM_DO_NOT_TOUCH>[\s\S]*?<\/APM_DO_NOT_TOUCH>/gi, ' ');
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n\n');
  s = s.replace(/<\/h2>/gi, ' ');
  s = s.replace(/<\/h3>/gi, ' ');
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
 * MT URL path encoder: zero-pad to 3 digits then append a trailing '0'.
 * 5  → "0050"
 * 198 → "1980"
 * 10 → "0100"
 *
 * Used for chapter / part / section path segments AND the section filename.
 * Verified shape from live URL `chapter_0050/part_0010/section_0020/0450-0050-0010-0020.html`.
 *
 * @param {string|number} n
 * @returns {string}
 */
export function padMT(n) {
  const s = String(n);
  if (!/^\d+$/.test(s)) throw new Error(`padMT: non-numeric ${s}`);
  return s.padStart(3, '0') + '0';
}

/**
 * Title TOC URL — chapters index for Title 45.
 */
export function buildChapterListUrl() {
  return `${MT_BASE_URL}/bills/mca/title_${MT_TITLE_ENCODED}/chapters_index.html`;
}

/**
 * Chapter parts index URL.
 * @param {string|number} chapter — canonical chapter number (1, 2, ..., 10)
 */
export function buildPartsIndexUrl(chapter) {
  const c = padMT(chapter);
  return `${MT_BASE_URL}/bills/mca/title_${MT_TITLE_ENCODED}/chapter_${c}/parts_index.html`;
}

/**
 * Part sections index URL.
 * @param {string|number} chapter
 * @param {string|number} part
 */
export function buildSectionsIndexUrl(chapter, part) {
  const c = padMT(chapter);
  const p = padMT(part);
  return `${MT_BASE_URL}/bills/mca/title_${MT_TITLE_ENCODED}/chapter_${c}/part_${p}/sections_index.html`;
}

/**
 * Section page URL.
 * @param {string|number} chapter
 * @param {string|number} part
 * @param {string|number} section
 */
export function buildSectionUrl(chapter, part, section) {
  const c = padMT(chapter);
  const p = padMT(part);
  const s = padMT(section);
  return `${MT_BASE_URL}/bills/mca/title_${MT_TITLE_ENCODED}/chapter_${c}/part_${p}/section_${s}/${MT_TITLE_ENCODED}-${c}-${p}-${s}.html`;
}

// ── Discovery regexes (run on already-loaded HTML strings) ─────────────────

// chapters_index.html: links to chapter_NNNN/parts_index.html (relative or absolute).
// Real live form: `./chapter_0010/parts_index.html`. Absolute form ends in
// `.../title_0450/chapter_NNNN/parts_index.html`.
const RX_MT_CHAPTER_LINK =
  /<a\s+[^>]*href=["']([^"']*chapter_(\d{4})\/parts_index\.html)["']/gi;

// parts_index.html: links to part_NNNN/sections_index.html. Real live form is
// page-relative: `./part_NNNN/sections_index.html` (chapter_ prefix NOT present).
// We match the bare `part_NNNN/sections_index.html` pattern and derive chapter
// from the baseUrl after URL resolution.
const RX_MT_PART_LINK =
  /<a\s+[^>]*href=["']([^"']*part_(\d{4})\/sections_index\.html)["']/gi;

// sections_index.html: links to section_NNNN/0450-NNNN-NNNN-NNNN.html.
// Real live form is page-relative + carries the canonical citation INSIDE
// the anchor body (single source of truth for sectionNum):
//   <a href="./section_0010/0450-0050-0010-0010.html"><span class="citation">45-5-101</span>&nbsp;Title</a>
// We capture: full href, encoded section path segment, filename stem, AND the
// canonical citation from the inner span. The citation is authoritative — URL
// encoding does NOT map deterministically to the citation (e.g. section_0010
// → §45-5-101 in chapter 5 but → §45-1-1 in some legacy synthetic shape).
const RX_MT_SECTION_LINK =
  /<a\s+[^>]*href=["']([^"']*section_(\d{4})\/(0450-\d{4}-\d{4}-\d{4})\.html)["'][^>]*>(?:[\s\S]*?<span\s+[^>]*class=["'][^"']*\bcitation\b[^"']*["'][^>]*>\s*(45-\d+-\d+(?:\([^)]+\))?)\s*<\/span>)?/gi;

// Inactive/repealed marker — appears in section page bodies; verified 2026-05-02
// against design report. MT pages with whole-section repeals are short and
// contain "Repealed", "Renumbered", or "Terminated".
const RX_MT_INACTIVE_HINT = /\b(?:Repealed|Renumbered|Terminated|Reserved)\b/i;

/**
 * Convert relative or absolute href to absolute mca.legmt.gov URL, resolving
 * against an optional base URL.
 *
 * Accepts:
 *   https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/parts_index.html
 *   /bills/mca/title_0450/chapter_0050/parts_index.html       (root-relative)
 *   ./chapter_0050/parts_index.html                            (page-relative; needs base)
 *   chapter_0050/parts_index.html                              (page-relative; needs base)
 *
 * The real mca.legmt.gov chapters_index.html uses `./chapter_NNNN/...` hrefs
 * relative to the page URL (verified live 2026-05-02). A `baseUrl` argument
 * is required to resolve those correctly.
 *
 * @param {string} href
 * @param {string} [baseUrl]  parent page URL — required for `./` / bare hrefs
 * @returns {string|null}
 */
function absolutize(href, baseUrl) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/')) return `${MT_BASE_URL}${href}`;
  // Page-relative — resolve via WHATWG URL against baseUrl (or origin fallback).
  try {
    const base = baseUrl || `${MT_BASE_URL}/`;
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/**
 * Discover chapter URLs from the title chapters_index.html.
 *
 * Filters cross-title noise: if the href contains a `title_NNNN` segment, it
 * MUST be `title_0450`. Hrefs without any `title_` segment (the common case
 * for `./chapter_NNNN/parts_index.html` page-relative links on the real
 * chapters_index.html) are accepted — the resolved absolute URL inherits the
 * title from `baseUrl`.
 *
 * @param {string} html
 * @param {string} [baseUrl]  parent page URL — required for relative hrefs
 * @returns {{chapter: string, url: string}[]}
 */
export function discoverChapterUrls(html, baseUrl = buildChapterListUrl()) {
  if (!html) return [];
  const seen = new Set();
  const out = [];
  RX_MT_CHAPTER_LINK.lastIndex = 0;
  let m;
  while ((m = RX_MT_CHAPTER_LINK.exec(html)) !== null) {
    const rawHref = m[1];
    const encoded = m[2];
    // Cross-title filter: if href names a different title, drop it.
    const titleMatch = rawHref.match(/title_(\d{4})/);
    if (titleMatch && titleMatch[1] !== MT_TITLE_ENCODED) continue;
    const url = absolutize(rawHref, baseUrl);
    if (!url) continue;
    // Post-resolution sanity: the absolute URL must be anchored under title_0450.
    if (!url.includes(`title_${MT_TITLE_ENCODED}`)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const canonical = decodeMTSegment(encoded);
    out.push({ chapter: canonical, url });
  }
  return out;
}

/**
 * Discover part URLs from a chapter parts_index.html.
 *
 * @param {string} html
 * @param {string|number} [chapterFilter] — optional canonical chapter to filter
 * @param {string} [baseUrl] — parent page URL — required for `./` hrefs
 * @returns {{chapter: string, part: string, url: string}[]}
 */
export function discoverPartUrls(html, chapterFilter = null, baseUrl = null) {
  if (!html) return [];
  const seen = new Set();
  const out = [];
  RX_MT_PART_LINK.lastIndex = 0;
  // chapterFilter-aware base fallback: when baseUrl missing, build one from
  // chapterFilter so page-relative `./part_NNNN/sections_index.html` resolves.
  const fallbackBase = baseUrl ||
    (chapterFilter != null ? buildPartsIndexUrl(chapterFilter) : `${MT_BASE_URL}/bills/mca/title_${MT_TITLE_ENCODED}/`);
  let m;
  while ((m = RX_MT_PART_LINK.exec(html)) !== null) {
    const rawHref = m[1];
    const encPart = m[2];
    const titleMatch = rawHref.match(/title_(\d{4})/);
    if (titleMatch && titleMatch[1] !== MT_TITLE_ENCODED) continue;
    const url = absolutize(rawHref, fallbackBase);
    if (!url) continue;
    if (!url.includes(`title_${MT_TITLE_ENCODED}`)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    // Derive chapter from the absolute URL (works for both relative and absolute hrefs).
    const chapMatch = url.match(/\/chapter_(\d{4})\//);
    if (!chapMatch) continue;
    const canonChap = decodeMTSegment(chapMatch[1]);
    const canonPart = decodeMTSegment(encPart);
    if (chapterFilter != null && canonChap !== String(chapterFilter)) continue;
    out.push({ chapter: canonChap, part: canonPart, url });
  }
  return out;
}

/**
 * Discover section URLs from a part sections_index.html.
 *
 * @param {string} html
 * @param {{chapter?: string|number, part?: string|number}} [ctx]
 * @returns {{chapter: string, part: string, section: string, url: string, sectionNum: string}[]}
 */
export function discoverSectionUrls(html, ctx = {}) {
  if (!html) return [];
  const seen = new Set();
  const out = [];
  // ctx-aware base fallback so page-relative `./section_NNNN/...` hrefs
  // resolve correctly when baseUrl isn't passed.
  const fallbackBase = ctx.baseUrl ||
    (ctx.chapter != null && ctx.part != null
      ? buildSectionsIndexUrl(ctx.chapter, ctx.part)
      : `${MT_BASE_URL}/bills/mca/title_${MT_TITLE_ENCODED}/`);
  RX_MT_SECTION_LINK.lastIndex = 0;
  let m;
  while ((m = RX_MT_SECTION_LINK.exec(html)) !== null) {
    const rawHref = m[1];
    const filenameStem = m[3]; // 0450-NNNN-NNNN-NNNN
    const explicitCitation = m[4]; // canonical "45-C-S" from <span class="citation">, if present
    const url = absolutize(rawHref, fallbackBase);
    if (!url) continue;
    if (!url.includes(`title_${MT_TITLE_ENCODED}`)) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    // Derive chapter/part/section identifiers. URL-decoded values are FALLBACK
    // ONLY — the explicit `<span class="citation">` (when present) is the
    // authoritative source for sectionNum because the URL encoding does not
    // deterministically map to canonical citations across all chapters.
    const fnMatch = filenameStem.match(/^0450-(\d{4})-(\d{4})-(\d{4})$/);
    if (!fnMatch) continue;
    const canonChap = decodeMTSegment(fnMatch[1]);
    const canonPart = decodeMTSegment(fnMatch[2]);
    const fallbackSect = decodeMTSegment(fnMatch[3]);

    let sectionNum;
    let canonSect;
    if (explicitCitation) {
      sectionNum = explicitCitation;
      // Extract section component for storage / debugging
      const cm = explicitCitation.match(/^45-\d+-(\d+(?:\([^)]+\))?)$/);
      canonSect = cm ? cm[1] : fallbackSect;
    } else {
      sectionNum = `45-${canonChap}-${fallbackSect}`;
      canonSect = fallbackSect;
    }

    if (ctx.chapter != null && canonChap !== String(ctx.chapter)) continue;
    if (ctx.part != null && canonPart !== String(ctx.part)) continue;

    out.push({
      chapter: canonChap,
      part: canonPart,
      section: canonSect,
      url,
      sectionNum,
    });
  }
  return out;
}

/**
 * Decode MT 4-char encoded segment ("00C0") → canonical number ("C").
 *
 * "0050" → "5"
 * "1980" → "198"
 * "0100" → "10"
 *
 * @param {string} encoded
 * @returns {string}
 */
function decodeMTSegment(encoded) {
  if (!/^\d{4}$/.test(encoded)) {
    throw new Error(`decodeMTSegment: bad shape ${encoded}`);
  }
  // Drop trailing '0', strip leading zeros, fall back to "0" for all-zeros input
  const stripped = encoded.slice(0, 3).replace(/^0+/, '');
  return stripped === '' ? '0' : stripped;
}

/**
 * Extract canonical section identifier ("45-5-102") from a section URL.
 *
 * @param {string} sectionUrl
 * @returns {string}
 */
export function sectionIdFromUrl(sectionUrl) {
  const m = sectionUrl.match(/\/section_\d{4}\/0450-(\d{4})-\d{4}-(\d{4})\.html/);
  if (!m) throw new Error(`sectionIdFromUrl: cannot parse ${sectionUrl}`);
  const chap = decodeMTSegment(m[1]);
  const sect = decodeMTSegment(m[2]);
  return `45-${chap}-${sect}`;
}

// ── Section page parser ────────────────────────────────────────────────────

// Title heading (real MT 2025 shape):
//   <h1 class="section-section-title">Short Title</h1>
const RX_MT_SECTION_TITLE =
  /<h1\s+[^>]*class=["'][^"']*\bsection-section-title\b[^"']*["'][^>]*>\s*([\s\S]*?)<\/h1>/i;

// Citation span anchoring the section number (real MT 2025 shape):
//   <span class="citation">45-1-101</span>
const RX_MT_CITATION =
  /<span\s+[^>]*class=["'][^"']*\bcitation\b[^"']*["'][^>]*>\s*(45-\d+-\d+(?:\([^)]+\))?)\s*<\/span>/i;

// Body container (real MT 2025 shape):
//   <div class="section-doc" id="mca_NNNN-NNNN-NNNN-NNNN"> ... </div>
//   followed by <div class="history-doc"> ... </div>
const RX_MT_SECTION_DOC =
  /<div\s+[^>]*class=["'][^"']*\bsection-doc\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\s+[^>]*class=["'][^"']*\bhistory-doc\b/i;

// Legacy fallback heading (synthetic-fixture shape; some older MT pages):
//   <h2>45-5-102. Deliberate homicide -- penalty.</h2>
const RX_MT_LEGACY_H2 =
  /<h2\b(?![^>]*class=["'][^"']*\bsection-(?:part|chapter|title)-title)[^>]*>\s*(45-\d+-\d+(?:\([^)]+\))?)\.\s*([\s\S]*?)<\/h2>/i;

/**
 * Parse an MT Title 45 section page.
 *
 * Returns {titleText, bodyText, effectiveDate} for active sections;
 * null for repealed shells / parse drift.
 *
 * Two structural variants supported:
 *
 *   1. Real MT 2025 shape (verified live 2026-05-02):
 *      <h1 class="section-section-title">Short Title</h1>
 *      <div class="section-doc" id="mca_0450-0010-0010-0010">
 *        <div class="section-content">
 *          <p><span class="catchline">
 *            <span class="citation">45-1-101</span>.&#8195;Short title.
 *          </span> This title shall be known...</p>
 *        </div>
 *      </div>
 *      <div class="history-doc"> ... </div>
 *
 *   2. Synthetic legacy shape (used in older fixtures + repealed shells):
 *      <h2>45-5-102. Deliberate homicide -- penalty.</h2>
 *      <p>(1) ...</p>
 *      <hr>
 *      <div class="history">...</div>
 *
 * Variant 1 takes precedence — if the section-section-title h1 + citation span
 * BOTH match and citation matches sectionNum, parse via variant 1. Otherwise
 * fall back to variant 2 for legacy/synthetic content.
 *
 * @param {string} html
 * @param {string} sectionNum  e.g. "45-5-102"
 * @returns {{titleText: string, bodyText: string, effectiveDate: null}|null}
 */
export function parseSection(html, sectionNum) {
  if (!html || html.length < 800) return null;

  // Strip Akamai prefix defensively.
  const cleaned = html.replace(
    /<APM_DO_NOT_TOUCH>[\s\S]*?<\/APM_DO_NOT_TOUCH>/gi,
    ' ',
  );

  // ── Variant 1: real MT 2025 shape ──────────────────────────────────
  const titleMatch = cleaned.match(RX_MT_SECTION_TITLE);
  const citeMatch = cleaned.match(RX_MT_CITATION);
  if (titleMatch && citeMatch && citeMatch[1] === sectionNum) {
    const titleText = stripHtml(titleMatch[1]).replace(/\.$/, '').trim();
    const bodyMatch = cleaned.match(RX_MT_SECTION_DOC);
    if (bodyMatch) {
      const bodyText = stripHtml(bodyMatch[1]);
      if (bodyText && bodyText.length >= 30) {
        // Repealed-shell detection on body
        if (bodyText.length < 200 && RX_MT_INACTIVE_HINT.test(bodyText)) {
          return null;
        }
        return {
          titleText: titleText || `Section ${sectionNum}`,
          bodyText,
          effectiveDate: null,
        };
      }
    }
  }

  // ── Variant 2: legacy synthetic shape (h2 heading) ─────────────────
  const hm = cleaned.match(RX_MT_LEGACY_H2);
  if (!hm) return null;
  if (hm[1] !== sectionNum) return null;
  const titleText2 = stripHtml(hm[2]).replace(/\.$/, '').trim();

  // Body: from end of </h2> to first <hr> or <div class="history">
  const headEndIdx = cleaned.indexOf('</h2>', cleaned.indexOf(hm[0]));
  if (headEndIdx < 0) return null;
  const bodyStart = headEndIdx + 5;
  let footerStart = cleaned.indexOf('<hr', bodyStart);
  const histStart = cleaned.search(/<div\s+[^>]*class=["'][^"']*\bhistory\b/i);
  if (histStart > bodyStart && (footerStart < 0 || histStart < footerStart)) {
    footerStart = histStart;
  }
  const bodyChunk = footerStart > bodyStart
    ? cleaned.slice(bodyStart, footerStart)
    : cleaned.slice(bodyStart, bodyStart + 50000);
  const bodyText2 = stripHtml(bodyChunk);
  if (!bodyText2 || bodyText2.length < 30) return null;

  if (bodyText2.length < 200 && RX_MT_INACTIVE_HINT.test(bodyText2)) {
    return null;
  }

  return {
    titleText: titleText2 || `Section ${sectionNum}`,
    bodyText: bodyText2,
    effectiveDate: null,
  };
}
