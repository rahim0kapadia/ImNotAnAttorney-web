// Template: scripts/ingest/lib/ar-xml.mjs (sister parser, AR Title 5 XML)
// Pattern: cl-bulk-data-defensive #18 — parser feeds shared unicourt-harness
// csv-bulk-checked: none-exists — UniCourt cic-code-* GitHub Pages mirrors are
//   the closest bulk source for non-Justia-blockable states. UniCourt repos are
//   public domain per Georgia v. Public.Resource.Org (SCOTUS 2020).
//
// Generic UniCourt cic-code-* HTML title parser.
//
// Universal section-id pattern (verified 2026-05-02 across AK/ID/KY/ND/RI/TN/VT):
//
//   <h3 [class="section"]? id="t{TITLE}(p{PART})?c{CHAPTER}s{SECTION}">
//     <b>§ {sectionNum}. {heading text}</b>
//   </h3>
//   <p>BODY</p>
//   ...
//   <div><h4 id="...history">          ← commentary boundary, stop here
//   <div><h4 id="...notestodecisions"> ← commentary boundary, stop here
//   <div><h4 id="...CASENOTES">        ← commentary boundary, stop here
//   <div><h4 id="...OPINIONSOFATTORNEYGENERAL"> ← commentary boundary, stop here
//   <div><h4 id="...ANNOTATIONS">      ← commentary boundary, stop here
//   <div><h4 id="...cited">            ← commentary boundary, stop here
//   <div><h4 id="...Source">           ← commentary boundary, stop here
//   ...next <h3 id="t...c...s...">     ← also stop boundary
//
// Per-state quirks (inspection log 2026-05-02):
//   - AK : id="t11c05s11.05.010"   chapter="05"   section="11.05.010"
//   - ID : id="t18c01s18-100"      chapter="01"   section="18-100"
//   - KY : id="t0Lc500s500.010"    chapter="500"  section="500.010"   title="0L" (Title L = chapters 500-534, Penal Code)
//   - ND : id="t12.1c12.1-01s12.1-01-01"   chapter="12.1-01"  section="12.1-01-01"   (h3 has class="section" attr BEFORE id)
//   - RI : id="t11c01s11-1-1"      chapter="01"   section="11-1-1"
//   - TN : id="t39c01s39-1-101"    chapter="01"   section="39-1-101"
//   - VT : id="t13p01c01s01"       chapter="01"   section="01"   part="01"
//
// All seven states share the SAME h3-section-id structure with optional `p<PART>`
// segment inserted before `c<CHAPTER>` (only VT uses parts in this batch).

/**
 * @typedef {Object} UnicourtSection
 * @property {string} chapterNum  e.g. "05", "500", "12.1-01"
 * @property {string} sectionNum  e.g. "11.05.010", "500.010", "12.1-01-01"
 * @property {string} titleText   heading text from <h3> (HTML stripped, "§"/"Sec." stripped, sectionNum stripped)
 * @property {string} bodyText    body text up to first commentary <h4> or next <h3 id=t...>
 * @property {string} [partNum]   optional VT part number, e.g. "01"
 */

// ---------------------------------------------------------------------------
// HTML entity decode + tag strip
// ---------------------------------------------------------------------------

/**
 * Decode common HTML entities and strip all HTML tags from a fragment.
 * Mirrors scripts/ingest/lib/ar-xml.mjs#stripHtml so behavior is identical
 * across XML and HTML title parsers.
 */
export function stripHtml(raw) {
  if (!raw) return '';
  return raw
    // Strip tags FIRST — order matters. If we decoded entities first, then any
    // entity-encoded HTML inside a real tag (rare but real on KY citations like
    // <pre>&lt;a href&gt;</pre>) would become a live tag we'd then fail to
    // strip (since regex tag-strip is single-pass).
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    // After tag-strip, decode common entities for clean output text.
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#167;/g, '§')
    .replace(/&#xa7;/gi, '§')
    .replace(/&sect;/gi, '§')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => {
      const n = Number(dec);
      // Drop control bytes (C0 + DEL) per stripHtml in va seed
      if (n < 0x20 && n !== 0x09 && n !== 0x0A && n !== 0x0D) return '';
      if (n === 0x7F) return '';
      return String.fromCharCode(n);
    })
    .replace(/[\s ]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Parse the title-id encoded in <h3 id="t…c…s…">
// ---------------------------------------------------------------------------

/**
 * Decode the universal cic-code section id.
 * Returns null when the id doesn't match the section shape (e.g. nav anchors,
 * table-of-contents links with -snavNN suffix).
 *
 * Pattern: t<TITLE>(p<PART>)?c<CHAPTER>s<SECTION>
 *   - <TITLE> and <PART> are alphanumeric (KY uses "0L"; VT uses 01)
 *   - <CHAPTER> and <SECTION> may include digits, dots, hyphens, letters
 *
 * @param {string} id
 * @returns {{title:string, part:?string, chapter:string, section:string}|null}
 */
export function parseSectionId(id) {
  if (typeof id !== 'string' || id.length === 0) return null;
  if (id.includes('-snav')) return null;
  // Locate the LAST `s` segment — VT occasionally produces nested ids like
  // `t13p01c08s01s351` (an inner table-of-contents row + section). Splitting
  // on the rightmost `s` keeps `section` aligned with the actual statute number
  // and folds the outer fragment back into `chapter`.
  const lastS = id.lastIndexOf('s');
  if (lastS <= 0) return null;
  const head = id.slice(0, lastS);          // e.g. "t13p01c08s01" or "t11c05"
  const section = id.slice(lastS + 1);      // e.g. "351" or "11.05.010"
  if (!section) return null;
  // Now decode the head: t<TITLE>(p<PART>)?c<CHAPTER>(s<SUB-CHAPTER>)?
  const m = /^t([^c]+?)(?:p([0-9A-Za-z]+))?c(.+)$/.exec(head);
  if (!m) return null;
  const [, title, part, chapter] = m;
  return { title, part: part || null, chapter, section };
}

// ---------------------------------------------------------------------------
// HTML window helpers
// ---------------------------------------------------------------------------

/**
 * Locate every `<h3 ... id="t…c…s…">` opening in the title HTML.
 * Returns ordered list of `{ openIdx, endOfOpenTagIdx, id }`.
 *
 * @param {string} html
 * @returns {Array<{openIdx:number, endOfOpenTagIdx:number, id:string}>}
 */
export function findSectionAnchors(html) {
  const out = [];
  if (typeof html !== 'string' || html.length === 0) return out;
  // Tolerate `<h3 ...>` with extra attributes (ND uses class="section").
  // Capture the FULL <h3 ...> open tag, then extract id from it.
  const re = /<h3\b[^>]*\sid=(?:"|')([^"']+)(?:"|')[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const openIdx = m.index;
    const endOfOpenTagIdx = openIdx + m[0].length;
    out.push({ openIdx, endOfOpenTagIdx, id: m[1] });
  }
  return out;
}

/**
 * Find the closing `</h3>` index relative to the open-tag end.
 * Returns -1 on miss (rare; cic-code corpus is well-formed).
 *
 * @param {string} html
 * @param {number} fromIdx index of first byte AFTER `<h3 ...>` open tag
 * @returns {number} index of `<` in `</h3>`, or -1
 */
export function findHeadingClose(html, fromIdx) {
  return html.indexOf('</h3>', fromIdx);
}

/**
 * Names of <h4 id="…-X"> commentary blocks where statute body ends.
 * Anything from the FIRST hit of one of these onward is considered commentary
 * (case notes, history, A.G. opinions, annotations, source citations).
 */
export const COMMENTARY_TOKENS = [
  '-history',
  '-notestodecisions',
  '-CASENOTES',
  '-casenotes',
  '-OPINIONSOFATTORNEYGENERAL',
  '-cited',
  '-ANNOTATIONS',
  '-annotations',
  '-Source',
  '-source',
  '-COMMENT',
  '-comment',
  '-CrossReferences',
  '-crossreferences',
];

/**
 * Locate the first commentary `<h4 ... id="…<token>">` after `fromIdx`.
 * Returns the lowest match index, or -1 if no commentary tag is present.
 */
export function findCommentaryBoundary(html, fromIdx) {
  let lowest = -1;
  for (const token of COMMENTARY_TOKENS) {
    const needle = '<h4';
    let pos = fromIdx;
    while (true) {
      const next = html.indexOf(needle, pos);
      if (next === -1) break;
      // Look ahead for the id= attribute (within next 240 bytes — generous)
      const headEnd = html.indexOf('>', next);
      if (headEnd === -1) break;
      const head = html.slice(next, headEnd + 1);
      if (head.includes(token)) {
        if (lowest === -1 || next < lowest) lowest = next;
        break;
      }
      pos = headEnd + 1;
    }
  }
  return lowest;
}

/**
 * Locate the next `<h3 ... id="t…c…s…">` boundary AFTER `fromIdx`.
 * @param {Array<{openIdx:number, endOfOpenTagIdx:number, id:string}>} anchors
 * @param {number} fromIdx
 * @returns {number} index of next h3 open tag, or -1
 */
export function findNextSectionBoundary(anchors, fromIdx) {
  for (const a of anchors) {
    if (a.openIdx > fromIdx) return a.openIdx;
  }
  return -1;
}

/**
 * Locate the next chapter heading `<h2 ... id="t…c…">` after `fromIdx`.
 * Chapter headings are not body content for the previous section — they delimit
 * chapter boundaries and must terminate body extraction. Used after AK 11.05.140
 * inspection (2026-05-02) showed body text bleeding through chapter dividers.
 *
 * @param {string} html
 * @param {number} fromIdx
 * @returns {number} index of next h2 chapter open tag, or -1
 */
export function findNextChapterBoundary(html, fromIdx) {
  // Match `<h2 ...id="t<digits>c..."` opens, e.g. <h2 class="oneh2" id="t11c10">
  const re = /<h2\b[^>]*\sid=(?:"|')t[^"']+c[^"']+(?:"|')[^>]*>/g;
  re.lastIndex = fromIdx;
  const m = re.exec(html);
  if (!m) return -1;
  return m.index;
}

// ---------------------------------------------------------------------------
// Heading + body text extraction
// ---------------------------------------------------------------------------

/**
 * From the inner HTML of a <h3>, derive the heading text by:
 *   1. stripping HTML
 *   2. stripping a leading "§ " or "Sec. " or "Secs. " prefix
 *   3. stripping the section number itself if it leads
 *   4. stripping the period that follows the section number
 *
 * Example AK h3 inner: "<b> Sec. 11.05.010. Crimes defined; common law abolished. </b>"
 *   -> stripHtml: "Sec. 11.05.010. Crimes defined; common law abolished."
 *   -> after strip: "Crimes defined; common law abolished."
 *
 * @param {string} h3Inner the bytes between `<h3 ...>` and `</h3>`
 * @param {string} sectionNum e.g. "11.05.010"
 * @returns {string}
 */
export function extractHeadingText(h3Inner, sectionNum) {
  let s = stripHtml(h3Inner);
  // Drop "Sec. " / "Secs. " / "§ " prefix variants
  s = s.replace(/^(?:§|Sec\.|Secs\.|Section)\s*/i, '').trim();
  // Drop leading sectionNum + optional trailing punctuation
  if (sectionNum && s.startsWith(sectionNum)) {
    s = s.slice(sectionNum.length).trim();
    s = s.replace(/^[.\s\-—–]+/, '').trim();
  }
  // Drop trailing punctuation noise
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Extract body text from the bytes between end-of-h3 and the body boundary.
 * Boundary = MIN(next-section h3 index, first commentary h4 index, EOF).
 *
 * Strips HTML, collapses whitespace, drops trailing legislative-history line
 * starting with "Amended" / "Added" / "P.A." / "Acts " (best-effort sentence
 * split on ". ").
 *
 * @param {string} html FULL title html
 * @param {number} bodyStart index AFTER `</h3>`
 * @param {number} bodyEnd boundary index (exclusive)
 * @returns {string}
 */
export function extractBodyText(html, bodyStart, bodyEnd) {
  if (bodyStart >= bodyEnd) return '';
  const slice = html.slice(bodyStart, bodyEnd);
  const stripped = stripHtml(slice);
  if (!stripped) return '';

  // Split on sentence ". " then drop history / amend lines.
  const sentences = stripped.split(/(?<=[.])\s+/);
  const filtered = sentences.filter(s => !isHistoryFragment(s));
  const body = filtered.join(' ').replace(/\s+/g, ' ').trim();
  return body.slice(0, 4000);
}

/**
 * Heuristic: drop lines that look like legislative history.
 * Matches the same patterns AR uses, plus a few HTML-mirror specific shapes.
 */
function isHistoryFragment(text) {
  const t = (text || '').trim();
  if (!t) return true;
  return (
    t.startsWith('History.') ||
    t.startsWith('HISTORY:') ||
    t.startsWith('History.—') ||
    t.startsWith('Source.') ||
    t.startsWith('Source:') ||
    /^Amended\b/.test(t) ||
    /^Added\b/.test(t) ||
    /^Repealed\b/.test(t) ||
    /^P\.L\.\s/.test(t) ||
    /^Acts \d{4},/.test(t) ||
    /^A\.S\.A\.\s+1947/.test(t) ||
    /^ch\.\s*\d+/i.test(t) ||
    /^\d{4},\s+ch\./.test(t)
  );
}

// ---------------------------------------------------------------------------
// Top-level parse
// ---------------------------------------------------------------------------

/**
 * Parse a UniCourt cic-code-* title HTML and yield section records.
 * Compatible with the `UnicourtStateConfig.parseTitle` callback contract.
 *
 * @param {string} html FULL title html (multi-MB)
 * @param {Object} [options]
 * @param {string} [options.expectedTitle] If set, sections from a different `t<...>` are skipped (defensive — should never fire on canonical UniCourt files)
 * @returns {UnicourtSection[]}
 */
export function parseUnicourtTitle(html, options = {}) {
  const { expectedTitle = null } = options;
  if (typeof html !== 'string' || html.length === 0) return [];

  const anchors = findSectionAnchors(html);
  const out = [];
  const seen = new Set();

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const ids = parseSectionId(a.id);
    if (!ids) continue;
    if (expectedTitle && ids.title !== expectedTitle) continue;
    // Dedup — UniCourt occasionally repeats anchor ids in TOC vs body
    if (seen.has(ids.section)) continue;
    seen.add(ids.section);

    const headingClose = findHeadingClose(html, a.endOfOpenTagIdx);
    if (headingClose === -1) continue;

    const headingInner = html.slice(a.endOfOpenTagIdx, headingClose);
    const titleText = extractHeadingText(headingInner, ids.section);
    if (!titleText) continue;

    const bodyStart = headingClose + '</h3>'.length;
    const nextSec = findNextSectionBoundary(anchors.slice(i + 1), bodyStart);
    const nextChapter = findNextChapterBoundary(html, bodyStart);
    const commentary = findCommentaryBoundary(html, bodyStart);
    const candidates = [nextSec, nextChapter, commentary, html.length].filter(x => x > bodyStart);
    const bodyEnd = Math.min(...candidates);

    const bodyText = extractBodyText(html, bodyStart, bodyEnd);
    if (!bodyText) continue;

    out.push({
      chapterNum: ids.chapter,
      sectionNum: ids.section,
      titleText,
      bodyText,
      ...(ids.part ? { partNum: ids.part } : {}),
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Generic source-URL builder (fragment anchor on the title HTML mirror)
// ---------------------------------------------------------------------------

/**
 * Build a UniCourt-mirror source URL for one section. Uses the title HTML URL
 * with `#t…c…s…` anchor — the canonical fragment in every cic-code repo.
 *
 * @param {string} titleUrl  the canonical title HTML URL from STATE_CONFIG
 * @param {string} titleId   the t-segment of the section id, e.g. "11", "12.1", "0L"
 * @param {?string} partId   the p-segment of the section id, or null
 * @param {string} chapterId the c-segment of the section id, e.g. "05", "12.1-01"
 * @param {string} sectionId the s-segment of the section id, e.g. "11.05.010"
 * @returns {string}
 */
export function buildUnicourtFragmentUrl(titleUrl, titleId, partId, chapterId, sectionId) {
  const part = partId ? 'p' + partId : '';
  return `${titleUrl}#t${titleId}${part}c${chapterId}s${sectionId}`;
}
