// HTML parsing helpers for gc.nh.gov New Hampshire Revised Statutes Annotated
// (RSA) Title LXII (Criminal Code).
//
// Live structure verified 2026-05-02 against:
//   https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII.htm     (title TOC; lists chapters)
//   https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII-630.htm (chapter TOC; lists sections)
//   https://gc.nh.gov/rsa/html/LXII/630/630-1.htm       (per-section page)
//
// URL pattern facts (verified 2026-05-02):
//   - Title TOC chapter links use plain anchors with href="NHTOC-LXII-{C}.htm"
//   - Chapter TOC section links use relative paths "../LXII/{C}/{C}-{S}.htm"
//   - Section URLs resolve to absolute "https://gc.nh.gov/rsa/html/LXII/{C}/{C}-{S}.htm"
//   - Section identifiers use COLON syntax in published text ("630:1") but
//     DASH syntax in URL paths ("630-1.htm"). Parser normalizes everything to
//     colon syntax for canonical citation storage (matches RSA published form).
//   - Letter-suffixed chapters exist (632-A, 639-A, 644-A, 646-A, 649-A, 649-B,
//     650-A, 650-B, 650-C, 651-A through 651-F). Their section citations stay
//     "{chapter-with-dash}:{section}", e.g. "632-A:1".
//
// Robots: gc.nh.gov has Crawl-delay: 11 (verified 2026-05-02 — Wave 2 design report).
//   This is the HARD reason NH is engine-only routing: 11s * 50 chapter fetches +
//   11s * ~700 section fetches exceeds Vercel cron 900s budget. crawlDelayMs MUST
//   be 11000 in seeder config; reducing it violates robots.txt.
//
// Authoritative source URLs use gc.nh.gov directly — this is the official New
// Hampshire General Court (gc.nh.gov is the legislature's domain) RSA
// publisher. Justia / FindLaw mirrors are NOT authoritative.
//
// Pure in-memory string processing — no file I/O in this module. Mirrors
// fl-html.mjs / oh-html.mjs / ma-html.mjs / mn-html.mjs.

const NH_BASE_URL = 'https://gc.nh.gov';
export const NH_BASE = NH_BASE_URL;

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
    // Windows-1252 control-block en/em dashes — gc.nh.gov uses these literally
    // (mojibake from MS-Word source). Map BEFORE the generic numeric handler
    // because U+0096 / U+0097 fall in the C1 range that the strict filter drops.
    .replace(/&#150;|&#x96;/gi, '-')
    .replace(/&#151;|&#x97;/gi, '-')
    .replace(/&#145;|&#x91;/gi, "'")
    .replace(/&#146;|&#x92;/gi, "'")
    .replace(/&#147;|&#x93;/gi, '"')
    .replace(/&#148;|&#x94;/gi, '"')
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
  s = s.replace(/<\/h1>/gi, ' ');
  s = s.replace(/<\/h2>/gi, ' ');
  s = s.replace(/<\/h3>/gi, ' ');
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
 *   buildChapterUrl('630')   → https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII-630.htm
 *   buildChapterUrl('632-A') → https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII-632-A.htm
 *
 * @param {string} chapter  e.g. "630" or "632-A"
 * @returns {string}
 */
export function buildChapterUrl(chapter) {
  return `${NH_BASE_URL}/rsa/html/NHTOC/NHTOC-LXII-${chapter}.htm`;
}

/**
 * Build the authoritative section URL for an NH RSA section.
 * Section identifiers in URL paths use DASH between chapter and section
 * (630-1.htm). The CITATION form uses COLON (RSA 630:1).
 *
 *   buildNHSourceUrl('630', '1')   → https://gc.nh.gov/rsa/html/LXII/630/630-1.htm
 *   buildNHSourceUrl('632-A', '2') → https://gc.nh.gov/rsa/html/LXII/632-A/632-A-2.htm
 *
 * @param {string} chapter  e.g. "630" or "632-A"
 * @param {string} section  e.g. "1" or "1-a"
 * @returns {string}
 */
export function buildNHSourceUrl(chapter, section) {
  return `${NH_BASE_URL}/rsa/html/LXII/${chapter}/${chapter}-${section}.htm`;
}

/**
 * Section number canonicalization.
 *
 *   canonicalSectionId('630',   '1')   → '630:1'
 *   canonicalSectionId('630',   '1-a') → '630:1-a'
 *   canonicalSectionId('632-A', '2')   → '632-A:2'
 *
 * @param {string} chapter
 * @param {string} secId
 * @returns {string}
 */
export function canonicalSectionId(chapter, secId) {
  return `${chapter}:${secId}`;
}

// ── Title-LXII chapter discovery ───────────────────────────────────────────
// Used when iterating cohort dynamically. The seeder normally hardcodes the
// chapter cohort (verified 2026-05-02). This helper exists for parity with
// VA/OH lib shapes and to support future dynamic cohort discovery.

const RX_NH_TITLE_TOC_CHAPTER = /href=["']NHTOC-LXII-([0-9]+(?:-[A-Z])?)\.htm["']/gi;

/**
 * Walk title-LXII TOC HTML and emit chapter tokens (e.g. "625", "632-A").
 * Dedupes preserving order.
 *
 * @param {string} titleTocHtml
 * @returns {string[]}
 */
export function discoverChapterTokens(titleTocHtml) {
  if (!titleTocHtml) return [];
  const seen = new Set();
  const out = [];
  RX_NH_TITLE_TOC_CHAPTER.lastIndex = 0;
  let m;
  while ((m = RX_NH_TITLE_TOC_CHAPTER.exec(titleTocHtml)) !== null) {
    const ch = m[1];
    if (seen.has(ch)) continue;
    seen.add(ch);
    out.push(ch);
  }
  return out;
}

// ── Per-chapter section discovery ──────────────────────────────────────────
//
// Chapter TOC links use a relative URL pattern: "../LXII/{C}/{C}-{S}.htm".
// Section IDs may include alpha sub-suffixes (e.g. 630-1-a → cited as 630:1-a).
// The chapter token may itself contain a dash for letter-suffixed chapters
// (632-A, 651-F). The regex anchors on a 3-digit numeric chapter prefix and
// permits an optional `-[A-Z]` suffix on the chapter token only.
const RX_NH_CHAPTER_TOC_SECTION = /href=["']\.\.\/LXII\/(\d{3}(?:-[A-Z])?)\/\1-([0-9]+(?:-[a-zA-Z])?)\.htm["']/gi;

/**
 * Discover per-section descriptors from a chapter TOC page.
 *
 * Behavior:
 *  - Filters to the requested chapter (refuses cross-chapter contamination).
 *  - Does NOT filter repealed sections at the URL layer — NH chapter TOCs
 *    mark repeals with inline text ("[Repealed, ...]") rather than a class.
 *    The section parser handles repealed pages by returning null, and the
 *    harness tolerates that as a skip.
 *
 * @param {string} chapterTocHtml
 * @param {string} chapter expected chapter token, e.g. "630" or "632-A"
 * @returns {Array<{sectionNum: string, chapterNum: string, sectionUrl: string}>}
 */
export function discoverSections(chapterTocHtml, chapter) {
  if (!chapterTocHtml) return [];
  const want = String(chapter);
  const seen = new Set();
  const out = [];
  RX_NH_CHAPTER_TOC_SECTION.lastIndex = 0;
  let m;
  while ((m = RX_NH_CHAPTER_TOC_SECTION.exec(chapterTocHtml)) !== null) {
    const linkChapter = m[1];
    const sectionTail = m[2];
    if (linkChapter !== want) continue;
    const sectionUrl = `${NH_BASE_URL}/rsa/html/LXII/${linkChapter}/${linkChapter}-${sectionTail}.htm`;
    if (seen.has(sectionUrl)) continue;
    seen.add(sectionUrl);
    out.push({
      sectionNum: canonicalSectionId(linkChapter, sectionTail),
      chapterNum: linkChapter,
      sectionUrl,
    });
  }
  return out;
}

/**
 * Extract chapter + section from a section URL.
 *
 * @param {string} sectionUrl
 * @returns {{ chapter: string, section: string }}
 */
export function partsFromUrl(sectionUrl) {
  const m = sectionUrl.match(/\/LXII\/(\d{3}(?:-[A-Z])?)\/\1-([0-9]+(?:-[a-zA-Z])?)\.htm$/);
  if (!m) throw new Error(`partsFromUrl: cannot parse ${sectionUrl}`);
  return { chapter: m[1], section: m[2] };
}

// ── Section page parser ────────────────────────────────────────────────────
//
// NH RSA section pages (verified via design-report 2026-05-02 + WebFetch
// inspection 2026-05-02) follow the structure:
//
//   <center><h3>Section 630:1</h3></center>
//   <b>630:1 Capital Murder. -</b>
//     I. A person is guilty of capital murder if he knowingly causes ...
//   <b>Source.</b>
//     1971, 518:1. 1974, 34:1; 35:1. 1977, 440:1. ... eff. ...
//
// The published HTML uses presentational markup (center + h3, then b for
// inline run-in headings). There are no semantic class names. The parser
// keys off:
//   1. <h3>Section {C}:{S}</h3> as the section-id verifier
//   2. The first <b>{C}:{S} Title.</b> after the h3 as the headnote
//   3. The text BETWEEN the headnote </b> and the next <b>Source</b>
//      (or <b>Cross References</b> / end-of-doc) as the body
//
// Repealed sections show "[Repealed, YYYY, NNN:N, eff. ...]" as the body,
// often as a single bracketed clause. Parser returns null when stripped body
// length minus repeal clause is below 30 chars (matches MN convention).

const RX_NH_HEADING_H3 = /<h3[^>]*>\s*(?:Section\s+)?([0-9]+(?:-[A-Z])?:[0-9]+(?:-[a-zA-Z])?)\s*<\/h3>/i;
const RX_NH_HEADNOTE_B = /<b>\s*([0-9]+(?:-[A-Z])?):([0-9]+(?:-[a-zA-Z])?)\s+([^<]+?)\s*<\/b>/i;
const RX_NH_SOURCE_B = /<b>\s*Source\.?\s*<\/b>/i;
const RX_NH_XREF_B = /<b>\s*Cross\s+References?\s*\.?\s*<\/b>/i;
const RX_NH_REPEALED_BODY = /\[\s*Repealed\b[^\]]{0,200}\]/i;

/**
 * Parse an NH RSA section page.
 *
 * Returns {titleText, bodyText, effectiveDate} for active sections;
 * null for repealed sections or when the section number doesn't match.
 *
 * @param {string} html
 * @param {string} sectionNum  canonical citation, e.g. "630:1" or "632-A:2"
 * @returns {{titleText: string, bodyText: string, effectiveDate: null}|null}
 */
export function parseSection(html, sectionNum) {
  if (!html || html.length < 500) return null;

  // Heading verification: <h3>Section {citation}</h3>
  const headingMatch = html.match(RX_NH_HEADING_H3);
  if (!headingMatch) return null;
  const headingCitation = headingMatch[1];
  if (headingCitation !== sectionNum) {
    return null;
  }

  // Run-in <b> headnote AFTER the h3.
  const headingIdx = html.indexOf(headingMatch[0]);
  const afterHeading = html.slice(headingIdx + headingMatch[0].length);

  const headnoteMatch = afterHeading.match(RX_NH_HEADNOTE_B);
  if (!headnoteMatch) return null;
  const noteChapter = headnoteMatch[1];
  const noteSection = headnoteMatch[2];
  const noteCitation = `${noteChapter}:${noteSection}`;
  if (noteCitation !== sectionNum) return null;

  // Decode entities first so Windows-1252 dashes (&#150;, &#151;) are
  // normalized to ASCII '-' before we strip trailing decoration. Then strip
  // trailing period/dash/whitespace runs.
  let titleText = decodeEntities(headnoteMatch[3]).trim();
  titleText = titleText.replace(/[.\-\s]+$/, '').trim();
  if (!titleText) titleText = `Section ${sectionNum}`;

  // Body: text from end of headnote </b> up to Source/Cross-References sentinel.
  const headnoteEndIdx = afterHeading.indexOf(headnoteMatch[0]) + headnoteMatch[0].length;
  let bodyChunkRaw = afterHeading.slice(headnoteEndIdx);

  const sourceIdx = bodyChunkRaw.search(RX_NH_SOURCE_B);
  const xrefIdx = bodyChunkRaw.search(RX_NH_XREF_B);
  let cutAt = -1;
  if (sourceIdx >= 0 && xrefIdx >= 0) cutAt = Math.min(sourceIdx, xrefIdx);
  else if (sourceIdx >= 0) cutAt = sourceIdx;
  else if (xrefIdx >= 0) cutAt = xrefIdx;
  if (cutAt > 0) bodyChunkRaw = bodyChunkRaw.slice(0, cutAt);

  // Repealed-body detection. If the body is JUST "[Repealed, ...]" with no
  // other substantive content, return null. Partially-repealed sections that
  // also contain replacement text continue through.
  if (RX_NH_REPEALED_BODY.test(bodyChunkRaw)) {
    const stripped = stripHtml(bodyChunkRaw);
    const withoutRepealClause = stripped.replace(RX_NH_REPEALED_BODY, '').trim();
    if (withoutRepealClause.length < 30) return null;
  }

  const bodyText = stripHtml(bodyChunkRaw);
  if (!bodyText || bodyText.length < 30) return null;

  return { titleText, bodyText, effectiveDate: null };
}
