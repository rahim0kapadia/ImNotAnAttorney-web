// HTML parsing helpers for legis.la.gov Louisiana Revised Statutes Title 14
// (Criminal Law).
//
// Live structure verified 2026-05-02 against:
//   https://www.legis.la.gov/legis/Laws_Toc.aspx?folder=88&title=14   (Title 14 TOC)
//   https://www.legis.la.gov/legis/Law.aspx?d=78397                   (active 14:30)
//   https://www.legis.la.gov/legis/Law.aspx?d=451830                  (repealed 14:32.10)
//   https://www.legis.la.gov/legis/Law.aspx?d=78605                   (active 14:67 theft)
//
// Robots: /robots.txt returns 404 — no Crawl-delay (verified 2026-05-02).
// Authoritative source URLs use legis.la.gov directly — this is the official
// publisher (Louisiana State Legislature).
//
// LA quirk (per Wave 2 design report 2026-05-02, Group 4 LA row):
//   - Section URLs use opaque numeric document IDs (Law.aspx?d=78397), NOT
//     human-readable citations. The R.S. 14:N citation is shown as anchor text
//     in the TOC and as the heading text on each section page.
//   - We store the canonical section number as the R.S. citation suffix
//     (e.g. "30", "32.10", "67") — matching MN's "609.02" convention but with
//     the title prefix ("14:") stripped. The title column on entities_statutes
//     already carries "14".
//   - The opaque document ID is preserved in the discovered URL but is NOT
//     used as the section number; the citation parsed from anchor text
//     (TOC) and confirmed against the heading text (section page) is the
//     canonical identifier.
//
// Pure in-memory string processing — no file I/O in this module. No regex on
// file contents (regex runs only on already-loaded HTML strings, not files).

const LA_BASE_URL = 'https://www.legis.la.gov';
export const LA_BASE = LA_BASE_URL;

// Title 14 TOC URL (folder=88 is the criminal-law folder; verified 2026-05-02).
export const LA_TITLE14_TOC_URL = `${LA_BASE_URL}/legis/Laws_Toc.aspx?folder=88&title=14`;

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
  s = s.replace(/<\/h2>/gi, ' ');
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
 * Build the Title 14 TOC URL. Convenience constant; folder=88 is the criminal
 * law folder identifier in the legis.la.gov structure.
 * @returns {string}
 */
export function buildTitleTocUrl() {
  return LA_TITLE14_TOC_URL;
}

/**
 * Build a section-fetch URL from the opaque numeric document id. NOTE: this
 * URL does not contain the canonical R.S. citation; we keep both the URL
 * (for fetching) and the parsed citation (for storage) separate.
 *
 * @param {string|number} docId  e.g. 78397
 * @returns {string}
 */
export function buildSectionFetchUrl(docId) {
  return `${LA_BASE_URL}/legis/Law.aspx?d=${docId}`;
}

/**
 * Authoritative source URL stored in entities_statutes.source_urls[]. We store
 * the legis.la.gov Law.aspx?d=N URL because (a) it's the only stable URL the
 * publisher gives us and (b) the canonical citation can be reconstructed
 * from row.title + row.section.
 *
 * @param {string|number} docId  e.g. 78397
 * @returns {string}
 */
export function buildLASourceUrl(docId) {
  return buildSectionFetchUrl(docId);
}

/**
 * Extract the opaque document id from a section URL.
 *   /legis/Law.aspx?d=78397   → "78397"
 * @param {string} sectionUrl
 * @returns {string}
 */
export function docIdFromUrl(sectionUrl) {
  const m = sectionUrl.match(/[?&]d=(\d+)\b/);
  if (!m) throw new Error(`docIdFromUrl: cannot parse ${sectionUrl}`);
  return m[1];
}

// ── Citation parsing ──────────────────────────────────────────────────────

/**
 * Parse "RS 14:30" / "RS 14:32.10" / "RS 14:95.1.4" anchor text and return
 * the canonical section suffix (the part AFTER "14:"). Returns null for the
 * title-level "RS 14" entry (no section suffix) or unparseable input.
 *
 * Rules:
 *   - Accept optional whitespace between "RS" and "14".
 *   - Title prefix MUST equal "14" (we are scoped to Title 14). Reject
 *     siblings like "RS 15:..." defensively.
 *   - Section suffix is one or more dot-separated numeric components,
 *     optionally with a single trailing letter (e.g. "32.10", "95.1.4",
 *     "95.4.1A" is unusual but tolerated). Empty suffix → null.
 *
 * @param {string} text  raw anchor text, e.g. "RS 14:30" or " RS 14:32.10 "
 * @returns {string|null}  canonical section suffix or null
 */
export function parseRsCitation(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/^R\.?S\.?\s*14\s*:\s*(\d+(?:\.\d+)*[A-Z]?)\s*$/i);
  if (!m) return null;
  return m[1];
}

/**
 * Parse the section page heading "§30. First degree murder" pattern and
 * return { sectionSuffix, headnote }. The heading lives inside the
 * `<span id="ctl00_PageBody_LabelDocument">` container as the FIRST <p> of
 * the document body, formatted as `§N.  Headnote` after entity decoding.
 *
 * Repealed sections render as `§32.10.  Repealed by Acts ...` — we treat
 * those as "headnote starts with Repealed" and let the seeder skip them.
 *
 * @param {string} headingText  already-stripped + decoded heading text
 * @returns {{sectionSuffix: string|null, headnote: string|null}}
 */
export function parseSectionHeading(headingText) {
  if (!headingText) return { sectionSuffix: null, headnote: null };
  // §30.  First degree murder
  // §32.10.  Repealed by Acts 2022, No. 545, §4.
  // §95.1.4.  ...
  const m = headingText.match(/^§\s*(\d+(?:\.\d+)*[A-Z]?)\s*\.\s*([\s\S]+?)\s*$/);
  if (!m) return { sectionSuffix: null, headnote: null };
  const sectionSuffix = m[1];
  let headnote = m[2].replace(/\s+/g, ' ').trim();
  // Strip trailing period, common in LA headings.
  headnote = headnote.replace(/\.$/, '').trim();
  return { sectionSuffix, headnote: headnote || null };
}

// ── TOC discovery ──────────────────────────────────────────────────────────

// The TOC is an ASP.NET ListView rendering one <tr> per "row". Each section
// row has TWO <a> tags (citation in left cell, headnote in right cell), both
// pointing to the same Law.aspx?d=N URL. We dedupe by docId.
//
// Repealed and "blank" entries:
//   - <a href="Law.aspx?d=N">RS 14:32.10</a>   (left cell: looks normal)
//   - <a href="Law.aspx?d=N">Repealed by Acts ...</a>  (right cell: gives away)
//   - <a href="Law.aspx?d=N">To 380 Repealed by Acts ...</a>  (range marker)
//   - <a href="Law.aspx?d=N">To 384 Blank</a>  (blank-range marker)
//
// We filter at discovery time so we never spend a polite-delay sleep on a
// body that resolves to a one-line "Repealed" shell. Blank-range markers
// are also skipped (no statutory text).
//
// Section-anchor pattern: any <a href="Law.aspx?d=NNN"> whose left-cell label
// parses as "RS 14:N" via parseRsCitation. Title-level entries ("RS 14",
// no colon) and sibling-title entries ("RS 15:..." — defensive) are dropped.

const RX_LA_TOC_ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const RX_LA_ROW_ANCHORS = /<a[^>]*href=["']Law\.aspx\?d=(\d+)["'][^>]*>([^<]+)<\/a>/g;
const RX_LA_REPEALED_LABEL = /^\s*(?:to\s+\d+\s+)?(?:repealed|blank)\b/i;
const RX_LA_REDESIGNATED_LABEL = /^\s*redesignated\b/i;

/**
 * Discover Title 14 section URLs from the TOC HTML. Filters repealed and
 * blank entries by inspecting BOTH anchors in each row (left = citation,
 * right = headnote/marker). Returns absolute fetch URLs.
 *
 * @param {string} html  TOC HTML
 * @returns {Array<{sectionSuffix: string, sectionUrl: string, docId: string, tocHeadnote: string|null}>}
 */
export function discoverSectionDescriptors(html) {
  if (!html) return [];
  const seen = new Set();
  const out = [];

  RX_LA_TOC_ROW.lastIndex = 0;
  let rowMatch;
  while ((rowMatch = RX_LA_TOC_ROW.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    if (!rowHtml) continue;

    // Collect every Law.aspx?d=N anchor in this row with its label text.
    RX_LA_ROW_ANCHORS.lastIndex = 0;
    const anchors = [];
    let am;
    while ((am = RX_LA_ROW_ANCHORS.exec(rowHtml)) !== null) {
      anchors.push({ docId: am[1], label: decodeEntities(am[2]).trim() });
    }
    if (anchors.length === 0) continue;

    // Find the citation anchor (label parses as RS 14:N) and the headnote
    // anchor (any sibling pointing to the same docId — usually anchor[1]).
    const citationAnchor = anchors.find((a) => parseRsCitation(a.label) !== null);
    if (!citationAnchor) continue;
    const sectionSuffix = parseRsCitation(citationAnchor.label);
    if (!sectionSuffix) continue;

    // Headnote = the OTHER anchor with the same docId (prefer non-citation).
    const headnoteAnchor = anchors.find(
      (a) => a.docId === citationAnchor.docId && a !== citationAnchor,
    );
    const tocHeadnote = headnoteAnchor ? headnoteAnchor.label : null;

    // Skip repealed / blank / redesignated rows. The check runs against the
    // headnote anchor's label (the right-cell text); the citation anchor's
    // label is always just "RS 14:N" so it never tells us repeal status.
    if (tocHeadnote) {
      if (RX_LA_REPEALED_LABEL.test(tocHeadnote)) continue;
      if (RX_LA_REDESIGNATED_LABEL.test(tocHeadnote)) continue;
    }

    if (seen.has(citationAnchor.docId)) continue;
    seen.add(citationAnchor.docId);

    out.push({
      sectionSuffix,
      sectionUrl: buildSectionFetchUrl(citationAnchor.docId),
      docId: citationAnchor.docId,
      tocHeadnote,
    });
  }
  return out;
}

/**
 * Convenience wrapper matching the bucket-b harness `discoverSections`
 * signature. Returns BucketBSectionDescriptor[] (sectionNum, sectionUrl,
 * chapterNum) — chapterNum is the title number "14" since LA's criminal
 * code is one flat title with no formal chapter substructure exposed in
 * the TOC HTML.
 *
 * @param {string} html
 * @param {object} [config]  unused — present for harness contract symmetry
 * @returns {Array<{sectionNum: string, sectionUrl: string, chapterNum: string}>}
 */
export function discoverSections(html, config) {
  const titleNum = (config && config.titleNum) || '14';
  return discoverSectionDescriptors(html).map((d) => ({
    sectionNum: d.sectionSuffix,
    sectionUrl: d.sectionUrl,
    chapterNum: titleNum,
  }));
}

// ── Section page parser ────────────────────────────────────────────────────

// Heading appears inside the document body as the first <p> with text-indent.
// The body container is `<span id="ctl00_PageBody_LabelDocument">`. We scope
// all parsing to that container so navigation chrome around it is ignored.
const RX_LA_DOC_CONTAINER = /<span\s+id=["']ctl00_PageBody_LabelDocument["'][^>]*>([\s\S]*?)<\/span>\s*<\/div>/i;

// Heading <p> — first paragraph of the document body whose stripped text
// begins with "§N." (after entity decoding). Some sections render structural
// labels (SUBPART / PART / CHAPTER / TITLE) as preceding centered paragraphs;
// we walk paragraphs in order and pick the first one matching the §-prefix
// pattern. RX_LA_PARAGRAPH iterates every <p>...</p>; the heading detector
// applies the strip-then-test heuristic.
const RX_LA_PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
const RX_LA_HEADING_TEXT_PREFIX = /^§\s*\d+(?:\.\d+)*[A-Z]?\s*\./;

/**
 * Parse a legis.la.gov Law.aspx section page.
 *
 * Returns {titleText, bodyText} for active sections.
 * Returns null for repealed sections, blank shells, parse errors, or when
 * the parsed section number disagrees with the descriptor.
 *
 * Structural variants observed 2026-05-02:
 *   1. Active: heading "§30.  First degree murder" + multi-paragraph body
 *      → return { titleText: "First degree murder", bodyText: "A. ... " }
 *   2. Repealed shell: heading "§32.10.  Repealed by Acts 2022, No. 545, §4."
 *      → return null (TOC filter should already drop these)
 *   3. Heading with multi-segment number (e.g. §95.1.4.) — same handling as 1
 *
 * @param {string} html       full page HTML
 * @param {string} sectionNum descriptor section suffix, e.g. "30" or "32.10"
 * @param {object} [_config]  unused
 * @returns {{titleText: string, bodyText: string, effectiveDate: null}|null}
 */
export function parseSection(html, sectionNum, _config) {
  if (!html || html.length < 500) return null;

  const docMatch = html.match(RX_LA_DOC_CONTAINER);
  if (!docMatch) return null;
  const docHtml = docMatch[1];
  if (!docHtml) return null;

  // Walk paragraphs in order; the first whose stripped text starts with
  // "§N." is the heading. Earlier paragraphs may be structural labels
  // (SUBPART / PART / CHAPTER / TITLE) and must be skipped, not treated as
  // the heading.
  RX_LA_PARAGRAPH.lastIndex = 0;
  let headingText = null;
  let headingEndIdx = -1;
  let pm;
  while ((pm = RX_LA_PARAGRAPH.exec(docHtml)) !== null) {
    const candidateText = stripHtml(pm[1]);
    if (!candidateText) continue;
    if (RX_LA_HEADING_TEXT_PREFIX.test(candidateText)) {
      headingText = candidateText;
      headingEndIdx = pm.index + pm[0].length;
      break;
    }
  }
  if (!headingText || headingEndIdx < 0) return null;

  const { sectionSuffix, headnote } = parseSectionHeading(headingText);
  if (!sectionSuffix) return null;

  // Defensive section-number cross-check (matches MN parser pattern). If the
  // heading number disagrees with what we discovered in the TOC, we'd be
  // about to write the wrong row — bail.
  if (sectionSuffix !== sectionNum) return null;

  // Repealed shell: headnote starts with "Repealed". Defensive in case TOC
  // discovery missed a repeal marker.
  if (!headnote) return null;
  if (/^repealed\b/i.test(headnote)) return null;
  if (/^blank\b/i.test(headnote)) return null;

  // Body = everything after the heading paragraph.
  const bodyHtml = docHtml.slice(headingEndIdx);
  const bodyText = stripHtml(bodyHtml);

  // Sanity: body must be substantial. Real LA sections are >80 chars even
  // for the shortest definitions; <30 likely means parse drift.
  if (!bodyText || bodyText.length < 30) return null;

  return { titleText: headnote, bodyText, effectiveDate: null };
}
