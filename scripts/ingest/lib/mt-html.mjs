// HTML parsing helpers for mca.legmt.gov Montana Code Annotated Title 45
// (Crimes).
//
// Live structure verified 2026-05-02 via WebFetch + raw fetch against:
//   https://mca.legmt.gov/bills/mca/title_0450/chapters_index.html
//   https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/parts_index.html
//   https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/sections_index.html
//   https://mca.legmt.gov/bills/mca/title_0450/chapter_0050/part_0010/section_0020/0450-0050-0010-0020.html
//
// === URL ENCODING ===
// Each path segment uses 4-digit zero-padded `NNN0` shape (positional index
// times 10). For 1-based positional N:
//   chapter 5  -> "0050"
//   chapter 10 -> "0100"
//   part 1     -> "0010"
//   section 1  -> "0010"
// Encoding formula: `String(n * 10).padStart(4, '0')`.
//
// === CITATION VS POSITIONAL INDEX ===
// CRITICAL: section URL filename uses POSITIONAL index, not citation. Section
// "45-5-102" lives at .../section_0020/0450-0050-0010-0020.html because it is
// the 2nd section listed in part 1. URL filename "0450-0050-0010-0020"
// decodes positionally as title=45 chapter=5 part=1 section-positional=2.
//
// Some positional slots span MULTIPLE citations (e.g. section_0080 in part 1
// of chapter 5 represents "45-5-108 through 45-5-110 reserved").
//
// === CONTENT STRUCTURE ===
// Section index page anchors use:
//   <a href="./section_NNN0/0450-NNN0-NNN0-NNN0.html">
//     <span class="citation">45-5-102</span>&nbsp;Deliberate homicide
//   </a>
//   <a href="..."><span class="citation">45-5-101</span>&nbsp;Repealed</a>
//   <a href="..."><span class="citation">45-5-108</span>&nbsp;through 45-5-110 reserved</a>
//
// Section page body lives in:
//   <div class="section-doc" id="mca_0450-0050-0010-0020">
//     <div class="section-content">
//       <p class="line-indent">
//         <span class="catchline"><span class="citation">45-5-102</span>.&#8195;Deliberate homicide.</span>
//         (1) A person commits the offense ...
//       </p>
//       <p class="line-indent">(a) ...</p>
//       ...
//     </div>
//   </div>
//   <div class="history-doc" id="mca_NNNN-NNNN-NNNN-NNNN_hist">...history...</div>
//
// Repealed section pages have the same shell but body is just:
//   <span class="catchline"><span class="citation">45-5-101</span>.&#8195;Repealed.</span> Sec. 11, Ch. 610, L. 1987.
// (very short body containing "Repealed" or "Reserved")
//
// === HEADNOTE ===
// Active sections also have <h1 class="section-section-title">Headnote</h1>
// in the page chrome, but the canonical "section <N>. <headnote>." appears
// inside the catchline span. We use the catchline as authoritative since it
// matches the citation context exactly.
//
// === ROBOTS / AKAMAI ===
// Robots: 404 on robots.txt (verified 2026-05-02). No Crawl-delay declared.
// We pay 2500ms per request anyway because the host is Akamai-fronted.
// Akamai prefix: per design plan section 3, mca.legmt.gov MAY decorate pages
// with an <APM_DO_NOT_TOUCH> JS block. Currently absent in 2026-05-02 fetches
// but `stripHtml` handles it defensively. If a future fetch returns 200 with
// challenge JS but no body, escalate to engine Playwright.
//
// SC-1 result (verified 2026-05-02 by reading bucket-b-html.mjs:301): the
// harness does NOT await `config.discoverSections`. Per plan section 5
// Option B, the seeder pre-walks the title->chapter->part->section tree
// using `fetchWithRetry` directly, then passes a sync `discoverSections`
// that returns the cached descriptor list (ignoring the harness's tocHtml
// argument).
//
// Pure in-memory string processing — no file I/O in this module. Mirrors
// mn-html.mjs / fl-html.mjs / oh-html.mjs. No regex on file contents.

const MT_BASE_URL = 'https://mca.legmt.gov';
export const MT_BASE = MT_BASE_URL;
const MT_TITLE = '0450';
export const MT_TITLE_PADDED = MT_TITLE;

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
    .replace(/&#8195;/gi, ' ')          // em-quad space (used in catchline)
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

// ── Strip tags + Akamai prefix ─────────────────────────────────────────────
export function stripHtml(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/<APM_DO_NOT_TOUCH\b[\s\S]*?<\/APM_DO_NOT_TOUCH>/gi, ' ');
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

// ── URL builders ───────────────────────────────────────────────────────────

export function padMT(n) {
  const x = typeof n === 'number' ? n : Number.parseInt(String(n), 10);
  if (!Number.isInteger(x) || x < 0) throw new Error(`padMT: invalid n=${n}`);
  return String(x * 10).padStart(4, '0');
}

export function buildChapterListUrl() {
  return `${MT_BASE_URL}/bills/mca/title_${MT_TITLE}/chapters_index.html`;
}

export function buildPartsIndexUrl(chapter) {
  const c = padMT(chapter);
  return `${MT_BASE_URL}/bills/mca/title_${MT_TITLE}/chapter_${c}/parts_index.html`;
}

export function buildSectionsIndexUrl(chapter, part) {
  const c = padMT(chapter);
  const p = padMT(part);
  return `${MT_BASE_URL}/bills/mca/title_${MT_TITLE}/chapter_${c}/part_${p}/sections_index.html`;
}

/**
 * Build a section URL given chapter, part, AND positional section index.
 * @param {number|string} chapter
 * @param {number|string} part
 * @param {number|string} sectionIdx  positional index within the part (1-based)
 */
export function buildSectionUrl(chapter, part, sectionIdx) {
  const c = padMT(chapter);
  const p = padMT(part);
  const s = padMT(sectionIdx);
  return `${MT_BASE_URL}/bills/mca/title_${MT_TITLE}/chapter_${c}/part_${p}/section_${s}/${MT_TITLE}-${c}-${p}-${s}.html`;
}

// ── URL parsing ────────────────────────────────────────────────────────────

export function parseSectionUrl(sectionUrl) {
  const m = sectionUrl.match(/\/section_(\d{4})\/(\d{4})-(\d{4})-(\d{4})-(\d{4})\.html/);
  if (!m) throw new Error(`parseSectionUrl: cannot parse ${sectionUrl}`);
  return {
    title: String(Number.parseInt(m[2], 10) / 10),
    chapter: String(Number.parseInt(m[3], 10) / 10),
    part: String(Number.parseInt(m[4], 10) / 10),
    sectionIdx: String(Number.parseInt(m[5], 10) / 10),
  };
}

/**
 * URL -> citation (positional fallback). NOT canonical for cases where the
 * positional slot doesn't match the actual citation. Use this only for
 * tests + bootstrapping; canonical citation comes from index anchor text.
 */
export function sectionIdFromUrl(sectionUrl) {
  const p = parseSectionUrl(sectionUrl);
  return `${p.title}-${p.chapter}-${p.part}-${p.sectionIdx}`;
}

/**
 * Extract canonical citation from an h1..h6 heading text. Returns null when
 * no heading present. Tolerated forms include `<h1>45-5-102. Foo</h1>`.
 *
 * Note: real MT pages don't put the citation in their visible <h1>; the
 * authoritative citation lives inside the catchline span. This helper is
 * kept for tests + future page-shape changes.
 *
 * @param {string} html
 * @returns {string|null}
 */
export function citationFromHeading(html) {
  if (!html) return null;
  const RX = /<h[1-6][^>]*>\s*(45-\d+-\d+(?:-\d+)?)\s*\.\s*([\s\S]*?)<\/h[1-6]>/i;
  const m = html.match(RX);
  if (!m) return null;
  return m[1];
}

// ── Title-level discovery (chapters_index.html) ────────────────────────────

const RX_MT_CHAPTER_LINK = /<a\s+[^>]*href=["'](?:\.\/)?chapter_(\d{4})\/parts_index\.html["']/gi;

export function discoverChapterUrls(html) {
  if (!html) return [];
  const out = [];
  const seen = new Set();
  RX_MT_CHAPTER_LINK.lastIndex = 0;
  let m;
  while ((m = RX_MT_CHAPTER_LINK.exec(html)) !== null) {
    const padded = m[1];
    const decoded = String(Number.parseInt(padded, 10) / 10);
    const url = `${MT_BASE_URL}/bills/mca/title_${MT_TITLE}/chapter_${padded}/parts_index.html`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ chapter: decoded, url });
  }
  return out;
}

// ── Chapter-level discovery (parts_index.html) ─────────────────────────────

const RX_MT_PART_LINK = /<a\s+[^>]*href=["'](?:\.\/)?part_(\d{4})\/sections_index\.html["']/gi;

export function discoverPartUrls(html, chapter) {
  if (!html) return [];
  const c = padMT(chapter);
  const out = [];
  const seen = new Set();
  RX_MT_PART_LINK.lastIndex = 0;
  let m;
  while ((m = RX_MT_PART_LINK.exec(html)) !== null) {
    const padded = m[1];
    const decoded = String(Number.parseInt(padded, 10) / 10);
    const url = `${MT_BASE_URL}/bills/mca/title_${MT_TITLE}/chapter_${c}/part_${padded}/sections_index.html`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ part: decoded, url });
  }
  return out;
}

// ── Part-level discovery (sections_index.html) — CITATION-AWARE ────────────

// Match section anchors with inner citation span + headnote.
// Structure observed 2026-05-02:
//   <a href="./section_0020/0450-0050-0010-0020.html">
//     <span class="citation">45-5-102</span>&nbsp;Deliberate homicide
//   </a>
const RX_MT_SECTION_ANCHOR = /<a\s+[^>]*href=["'](?:\.\/)?section_(\d{4})\/(\d{4}-\d{4}-\d{4}-\d{4})\.html["'][^>]*>([\s\S]*?)<\/a>/gi;
const RX_MT_CITATION_SPAN = /<span\s+class=["'][^"']*\bcitation\b[^"']*["'][^>]*>\s*(45-\d+-\d+)\s*<\/span>/i;
const RX_MT_INACTIVE_INDEX_HINT = /\b(?:Repealed|Renumbered|Terminated|Reserved|reserved)\b/;

/**
 * Discover section URLs from a part sections_index.html page.
 *
 * Each descriptor carries:
 *   - sectionIdx: positional index (e.g. "2" for section_0020)
 *   - filename: the URL filename without extension
 *   - url: full HTTPS URL
 *   - citation: canonical citation from anchor inner text (e.g. "45-5-102")
 *   - headnote: trailing text from anchor (after the citation span)
 *   - inactive: true if anchor text contains repealed/renumbered/reserved markers
 *
 * @param {string} html
 * @param {string|number} chapter
 * @param {string|number} part
 */
export function discoverSectionUrls(html, chapter, part) {
  if (!html) return [];
  const c = padMT(chapter);
  const p = padMT(part);
  const out = [];
  const seen = new Set();
  RX_MT_SECTION_ANCHOR.lastIndex = 0;
  let m;
  while ((m = RX_MT_SECTION_ANCHOR.exec(html)) !== null) {
    const sectionPadded = m[1];
    const filename = m[2];
    const innerHtml = m[3];

    // Skip non-section anchors (e.g. parent-nav links) by requiring inner citation
    const cm = innerHtml.match(RX_MT_CITATION_SPAN);
    if (!cm) continue;
    const citation = cm[1];

    const url = `${MT_BASE_URL}/bills/mca/title_${MT_TITLE}/chapter_${c}/part_${p}/section_${sectionPadded}/${filename}.html`;
    if (seen.has(url)) continue;
    seen.add(url);

    // Headnote = anchor inner text, minus the citation span
    const innerText = stripHtml(innerHtml.replace(RX_MT_CITATION_SPAN, ' '));
    const inactive = RX_MT_INACTIVE_INDEX_HINT.test(innerText);

    out.push({
      sectionIdx: String(Number.parseInt(sectionPadded, 10) / 10),
      filename,
      url,
      citation,
      headnote: innerText,
      inactive,
    });
  }
  return out;
}

// ── Section page parser (catchline-driven) ─────────────────────────────────

// Catchline outer: <span class="catchline">...</span>
// We can't use a simple non-greedy match because the catchline contains a
// nested <span class="citation">...</span>. We extract by locating the
// "catchline" anchor and walking forward to the SECOND </span> (balances the
// one nested citation span).
const RX_MT_CATCHLINE_OPEN = /<span\s+class=["'][^"']*\bcatchline\b[^"']*["'][^>]*>/i;
// Inside catchline: <span class="citation">CITATION</span>.HEADNOTE.
// (catchline body is `<cite>CIT</cite>.&#8195;HEADNOTE.` then </span>)
const RX_MT_CATCHLINE_INNER = /<span\s+class=["'][^"']*\bcitation\b[^"']*["'][^>]*>\s*(45-\d+-\d+)\s*<\/span>\s*\.?\s*([\s\S]*?)\.?\s*$/i;

// Section body container: <div class="section-doc" id="mca_NNNN-NNNN-NNNN-NNNN">
//                          <div class="section-content"> ... </div>
//                        </div>
//                        <div class="history-doc" ...> (sibling, NOT body)
const RX_MT_SECTION_DOC = /<div\s+class=["']section-doc["'][^>]*id=["']mca_([\d-]+)["'][^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>\s*)?(?=<div\s+class=["']history-doc|$)/i;

const RX_MT_INACTIVE_BODY = /\b(?:Repealed|Reserved|Renumbered|Terminated)\b/i;

/**
 * Parse a single MT section HTML page.
 *
 * Returns {titleText, bodyText, effectiveDate} for active sections;
 * returns null for repealed/reserved/short shells or citation mismatches.
 *
 * @param {string} html
 * @param {string} sectionNum  expected canonical citation, e.g. "45-5-102"
 */
export function parseSection(html, sectionNum) {
  if (!html || html.length < 800) return null;

  // Strip Akamai prefix defensively
  const cleaned = html.replace(/<APM_DO_NOT_TOUCH\b[\s\S]*?<\/APM_DO_NOT_TOUCH>/gi, ' ');

  // Extract section-doc body block
  const docMatch = cleaned.match(RX_MT_SECTION_DOC);
  if (!docMatch) return null;
  const docBody = docMatch[2];

  // Find catchline (balanced-span extraction)
  const openMatch = docBody.match(RX_MT_CATCHLINE_OPEN);
  if (!openMatch) return null;
  const catchOpenEnd = (openMatch.index ?? 0) + openMatch[0].length;
  // Walk forward counting <span> opens vs closes; need 1 net close to balance
  // the catchline open + any nested <span class="citation"> opens.
  let depth = 1; // we just consumed the catchline opening tag
  let scan = catchOpenEnd;
  let catchEnd = -1;
  while (scan < docBody.length) {
    const nextOpen = docBody.indexOf('<span', scan);
    const nextClose = docBody.indexOf('</span>', scan);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      scan = nextOpen + 5;
    } else {
      depth--;
      if (depth === 0) { catchEnd = nextClose; break; }
      scan = nextClose + 7;
    }
  }
  if (catchEnd === -1) return null;
  const catchInner = docBody.slice(catchOpenEnd, catchEnd);
  const innerMatch = catchInner.match(RX_MT_CATCHLINE_INNER);
  if (!innerMatch) return null;
  const headingCitation = innerMatch[1];
  if (sectionNum && headingCitation !== sectionNum) return null;

  let titleText = stripHtml(innerMatch[2]).replace(/\.$/, '').trim();
  if (!titleText) titleText = `Section ${sectionNum}`;

  // Body text = full section-doc content. Strip the catchline span itself
  // (open + balanced inner spans + close, computed above) to avoid duplicating
  // "(citation). headnote." in the body output.
  const bodyHtml = docBody.slice(0, openMatch.index ?? 0) + ' ' + docBody.slice(catchEnd + 7);
  const bodyText = stripHtml(bodyHtml);

  if (!bodyText || bodyText.length < 30) {
    // Repealed/reserved short shells — body is literally just "Sec. 11, Ch. 610..."
    return null;
  }

  // Defensive inactive-body skip: short body containing inactive marker
  if (RX_MT_INACTIVE_BODY.test(bodyText) && bodyText.length < 200) return null;
  // Short body with "Repealed" anywhere is likely a vacated section
  if (bodyText.length < 300 && /^Sec\.\s+\d+,?\s+Ch/.test(bodyText)) return null;

  return { titleText, bodyText, effectiveDate: null };
}
