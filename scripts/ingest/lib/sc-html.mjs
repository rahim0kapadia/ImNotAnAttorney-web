// Template: scripts/ingest/lib/ar-xml.mjs
// Pattern: cl-bulk-data-defensive #18 — bulk parse in-memory, COPY via harness
// Source: https://www.scstatehouse.gov/code/title16.php (chapter list, 17 chapters)
//         https://www.scstatehouse.gov/code/t16c{NNN}.php (per-chapter HTML, sections inline)
//
// SC HTML structure (verified 2026-05-02 against live t16c001.php fetch, 357KB):
//   <div id="contentsection">
//     <div ...>Title 16 - CRIMES AND OFFENSES</div>
//     <div ...>CHAPTER 1</div>
//     <div ...>Felonies and Misdemeanors; Accessories</div>
//     <span style="font-weight: bold;"> SECTION 16-1-10.</span> Title text.<br /><br />
//       (A) Body text...<br /><br />
//       ...
//       HISTORY: 1962 Code SECTION 16-11; ...<br /><br />
//     <span style="font-weight: bold;"> SECTION 16-1-20.</span> ...
//   </div>
//
// Sections have NO anchor IDs in the source HTML. Section boundary = next SECTION
// span marker (or end of contentsection). We synthesize a citation anchor (#16-X-N)
// when building source URLs so cited references are stable across re-renders.
//
// robots.txt (scstatehouse.gov): no Crawl-delay (verified 2026-05-02 robots sweep).

/**
 * @typedef {Object} ScSection
 * @property {string} chapterNum  e.g. "1", "3", "27"  (display form, leading zeros stripped)
 * @property {string} sectionNum  e.g. "16-1-10", "16-27-50"
 * @property {string} titleText   heading text (between SECTION span and first <br />)
 * @property {string} bodyText    body text, HTML-decoded and stripped, HISTORY removed
 */

// ---------------------------------------------------------------------------
// HTML entity decode + tag strip (mirrors ar-xml.stripHtml)
// ---------------------------------------------------------------------------

/**
 * Decode common HTML entities and strip HTML tags. Operates on in-memory
 * HTTP-fetched strings (not filesystem reads).
 */
export function stripHtml(raw) {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#167;/g, '§')
    .replace(/&#xa7;/gi, '§')
    .replace(/&sect;/gi, '§')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\s ]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Boundary marker for each section. Verified verbatim against fixture HTML.
// The leading space after "<span ...>" is part of the source HTML.
const SECTION_OPEN = '<span style="font-weight: bold;"> SECTION ';
const SPAN_CLOSE = '</span>';
const CONTENT_OPEN = '<div id="contentsection">';

// ---------------------------------------------------------------------------
// Section extraction
// ---------------------------------------------------------------------------

/**
 * Slice the contentsection inner HTML out of a full chapter doc. Falls back
 * to the entire doc if the marker is missing (defensive).
 */
function extractContentSection(html) {
  const start = html.indexOf(CONTENT_OPEN);
  if (start === -1) return html;
  return html.slice(start + CONTENT_OPEN.length);
}

/**
 * Find every SECTION span boundary. Returns an array of marker objects
 * sorted by appearance order.
 */
function findSectionMarkers(content) {
  const markers = [];
  let pos = 0;
  while (true) {
    const openIdx = content.indexOf(SECTION_OPEN, pos);
    if (openIdx === -1) break;
    const closeIdx = content.indexOf(SPAN_CLOSE, openIdx);
    if (closeIdx === -1) break;

    const inside = content.slice(openIdx + SECTION_OPEN.length, closeIdx).trim();
    const sectionNum = inside.endsWith('.') ? inside.slice(0, -1) : inside;

    markers.push({
      openIdx,
      sectionNum,
      headingEnd: closeIdx + SPAN_CLOSE.length,
    });
    pos = closeIdx + SPAN_CLOSE.length;
  }
  return markers;
}

/**
 * Extract a section's title (heading line) and body (everything after first
 * <br />) from a content slice between two markers.
 */
function extractTitleAndBody(content, bodyStart, bodyEnd) {
  const segment = content.slice(bodyStart, bodyEnd);
  const brIdx = segment.indexOf('<br');
  let rawHeading;
  let rawBody;
  if (brIdx === -1) {
    rawHeading = segment;
    rawBody = '';
  } else {
    rawHeading = segment.slice(0, brIdx);
    rawBody = segment.slice(brIdx);
  }
  return {
    titleText: stripHtml(rawHeading),
    bodyText: stripBody(rawBody),
  };
}

/**
 * Strip HTML from the raw body and remove HISTORY: tail. Truncate to 4000
 * chars (matches AR/CA convention).
 */
function stripBody(rawBody) {
  const decoded = stripHtml(rawBody);
  const histIdx = decoded.indexOf('HISTORY:');
  const trimmed = histIdx === -1 ? decoded : decoded.slice(0, histIdx);
  return trimmed.replace(/[\s ]+/g, ' ').trim().slice(0, 4000);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate "16-N-N" pattern (digits + optional trailing alpha for amended
 * sections like "16-3-20a"). Defensive against picking up cross-references
 * or junk content that happened to live inside a SECTION span.
 */
export function isValidScSectionNum(s) {
  if (!s || typeof s !== 'string') return false;
  const parts = s.split('-');
  if (parts.length !== 3) return false;
  if (parts[0] !== '16') return false;
  if (!/^\d+$/.test(parts[1])) return false;
  if (!/^\d+[a-zA-Z]?$/.test(parts[2])) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Parse one chapter
// ---------------------------------------------------------------------------

/**
 * Parse a single SC chapter HTML doc and return all sections within.
 *
 * @param {string} html         raw chapter HTML (e.g. body of t16c001.php)
 * @param {string} chapterNum   display form chapter number (e.g. "1", "27")
 * @returns {ScSection[]}
 */
export function parseScChapter(html, chapterNum) {
  const content = extractContentSection(html);
  const markers = findSectionMarkers(content);
  if (markers.length === 0) return [];

  const sections = [];
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const next = markers[i + 1];
    const bodyEnd = next ? next.openIdx : content.length;
    const { titleText, bodyText } = extractTitleAndBody(content, m.headingEnd, bodyEnd);

    if (!titleText) continue;
    if (!bodyText) continue;
    if (!isValidScSectionNum(m.sectionNum)) continue;

    sections.push({
      chapterNum,
      sectionNum: m.sectionNum,
      titleText,
      bodyText,
    });
  }
  return sections;
}

/**
 * Parse multiple SC chapters from a {chapterNum, html}[] iterable and
 * concatenate the section arrays. Used by the seeder when ingesting all 17
 * chapters of Title 16.
 *
 * @param {{chapterNum: string, html: string}[]} chapterDocs
 * @returns {ScSection[]}
 */
export function parseScChapters(chapterDocs) {
  const all = [];
  for (const doc of chapterDocs) {
    const secs = parseScChapter(doc.html, doc.chapterNum);
    for (const s of secs) all.push(s);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Source URL builders
// ---------------------------------------------------------------------------

/**
 * Build the canonical scstatehouse.gov URL for an SC Title 16 section.
 * Anchor convention: chapter URL + "#sectionNum" (e.g. t16c001.php#16-1-10).
 * Server returns the chapter doc; the fragment is for citation stability.
 *
 * @param {string} sectionNum  e.g. "16-1-10"
 * @returns {string}
 */
export function buildScSourceUrl(sectionNum) {
  const parts = sectionNum.split('-');
  const chapterRaw = parts[1] || '';
  const chapterPadded = chapterRaw.padStart(3, '0');
  return `https://www.scstatehouse.gov/code/t16c${chapterPadded}.php#${sectionNum}`;
}

/**
 * Build the chapter HTML URL for a given chapter number (display form).
 * Used by the seeder during bulk fetch.
 *
 * @param {string|number} chapterNum  e.g. "1", "27"
 * @returns {string}
 */
export function buildScChapterUrl(chapterNum) {
  const padded = String(chapterNum).padStart(3, '0');
  return `https://www.scstatehouse.gov/code/t16c${padded}.php`;
}

/**
 * Authoritative chapter list — Title 16 has 17 chapters with non-sequential
 * numbering (1, 3, 5, 7, 8, 9, 11, 13, 14, 15, 16, 17, 19, 21, 23, 25, 27).
 * Verified 2026-05-02 against title16.php chapter index page.
 */
export const SC_TITLE16_CHAPTERS = [
  '1', '3', '5', '7', '8', '9', '11', '13', '14',
  '15', '16', '17', '19', '21', '23', '25', '27',
];
