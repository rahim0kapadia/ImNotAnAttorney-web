// Template: scripts/ingest/lib/sc-html.mjs (sibling-shipped, single-doc-per-chapter pattern)
// Pattern: cl-bulk-data-defensive #18 — bulk parse in-memory, COPY via harness
// Source: https://www.leg.state.nv.us/NRS/index.html (chapter list)
//         https://www.leg.state.nv.us/NRS/NRS-{N}.html (per-chapter HTML, sections inline)
//
// NV HTML structure (verified 2026-05-02 against live NRS-200.html ~512KB; NRS-484A.html;
// NRS-484C.html; NRS-205.html; NRS-207.html). MS-Word generated; Times New Roman styling.
//
// Each chapter doc has TWO halves:
//   1. Top half: Table of Contents using `<a href="#NRS200Sec010">NRS 200.010</a>` style
//      links. We ignore these — they are not section markers, they're cross-refs.
//   2. Bottom half: actual statute text starting at `<p class="DocHeading">...</p>`.
//      Per-section paragraphs anchor like:
//
//      <p class="SectBody"><span class="Empty">… <a name=NRS200Sec010></a>NRS </span>
//      <span class="Section">200.010</span><span class="Empty">  </span>
//      <span class="Leadline">"Murder" defined.</span> Murder is the unlawful killing…</p>
//
//      <p class="SectBody">… 1.  With malice aforethought, either…</p>
//      <p class="SectBody">… 2.  Caused by…</p>
//      …
//      <p class="SourceNote">… [1911 C&P …]—(NRS A <a href="…">1983, 512</a>; …)</p>
//
//      Next section starts at the next `<a name=NRS{ChapterNum}Sec...>` anchor.
//
// Anchor convention: `NRS{ChapterNum}Sec{SectionDigits}` — chapter may be numeric
// (`200`, `205`) OR numeric+letter (`484A`, `484B`, `484C`). Citation form combines
// chapter + 3-digit section: `200.010`, `484C.030`.
//
// robots.txt (leg.state.nv.us): no Crawl-delay (verified 2026-05-02). 1500ms polite
// delay between chapter fetches as defensive floor.

/**
 * @typedef {Object} NVSection
 * @property {string} chapterNum  e.g. "200", "484A", "484C"   (matches URL chapter slug)
 * @property {string} sectionNum  e.g. "200.010", "484C.030"   (canonical NRS citation)
 * @property {string} titleText   Leadline text — heading
 * @property {string} bodyText    full body, HTML-decoded and stripped, history removed
 */

// ---------------------------------------------------------------------------
// HTML entity decode + tag strip
// ---------------------------------------------------------------------------

/**
 * Decode common HTML entities and strip HTML tags. NV's HTML uses Microsoft Word
 * artifacts heavily — en-spaces (`&#8194;`), em-dashes (`&#8212;`), and curly
 * quotes that may come through as raw bytes after a windows-1252 → UTF-8 round
 * trip. Replace with ASCII near-equivalents for clean DB storage.
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
    .replace(/&#8194;/g, ' ')   // en-space (MS-Word artifact)
    .replace(/&#8212;/g, '-')   // em-dash
    .replace(/&#8211;/g, '-')   // en-dash
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    // Replace common windows-1252 curly quotes / dashes that came through as raw
    // unicode from the fetch layer:
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/�/g, '')     // unicode replacement char (encoding mismatch)
    .replace(/[\s ]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// NV emits the anchor without quotes around the value: `<a name=NRS200Sec010>`.
const ANCHOR_PREFIX = '<a name=NRS';
// Document-body marker — only sections AFTER this point are real statutes; anything
// before is the TOC (which uses `<a href="#NRS...Sec...">` not `<a name=...>`).
const DOC_BODY_MARKERS = [
  '<p class="DocHeading">',
  '<p class=DocHeading>',
];

// ---------------------------------------------------------------------------
// Doc body extraction
// ---------------------------------------------------------------------------

/**
 * Slice the document body (post-TOC) out of a full chapter doc. Returns the
 * substring starting at the first DocHeading marker. Falls back to scanning the
 * second half of the document if no DocHeading marker present (defensive).
 */
function extractDocBody(html) {
  for (const marker of DOC_BODY_MARKERS) {
    const idx = html.indexOf(marker);
    if (idx !== -1) return html.slice(idx);
  }
  // Defensive fallback: chapter likely small and TOC-less. Skip first 25% of doc
  // to avoid TOC link false positives.
  return html.slice(Math.floor(html.length / 4));
}

// ---------------------------------------------------------------------------
// Source-note removal (history block)
// ---------------------------------------------------------------------------

/**
 * Strip every `<p class="SourceNote">…</p>` (and `class=SourceNote` no-quotes
 * variant) out of an HTML slice. Uses indexOf-based scanning — no regex on the
 * file contents.
 */
function stripSourceNotes(slice) {
  const variants = ['<p class="SourceNote">', '<p class=SourceNote>'];
  let out = slice;
  for (const open of variants) {
    while (true) {
      const start = out.indexOf(open);
      if (start === -1) break;
      const end = out.indexOf('</p>', start);
      if (end === -1) {
        // unterminated — drop everything from start (defensive, never observed)
        out = out.slice(0, start);
        break;
      }
      out = out.slice(0, start) + ' ' + out.slice(end + '</p>'.length);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Section anchor scan
// ---------------------------------------------------------------------------

/**
 * Find every `<a name=NRS{ChapterNum}Sec{NNN}>` anchor in the body. Returns an
 * array of marker objects sorted by appearance order.
 *
 * Anchor pattern: `<a name=NRS200Sec010>` (no quotes around the attribute value).
 * The chapterNum portion can include a single trailing letter (e.g. `484A`).
 *
 * We require an exact chapter-prefix match so cross-references like
 * `<a href="NRS-453.html#NRS453Sec3325">` (an `href`, not a `name`, but defensive
 * just in case markup ever drifts) cannot pollute another chapter's section list.
 */
function findSectionAnchors(body, chapterNum) {
  const chapterAnchorStart = `${ANCHOR_PREFIX}${chapterNum}Sec`;
  const markers = [];
  let pos = 0;
  while (true) {
    const startIdx = body.indexOf(chapterAnchorStart, pos);
    if (startIdx === -1) break;
    const closeIdx = body.indexOf('>', startIdx);
    if (closeIdx === -1) break;
    const inside = body.slice(startIdx + ANCHOR_PREFIX.length, closeIdx);
    const sepIdx = inside.indexOf('Sec');
    if (sepIdx === -1) {
      pos = closeIdx + 1;
      continue;
    }
    const anchorChapter = inside.slice(0, sepIdx);
    const sectionDigits = inside.slice(sepIdx + 'Sec'.length);
    if (anchorChapter !== chapterNum) {
      pos = closeIdx + 1;
      continue;
    }
    if (!sectionDigits || !/^[\dA-Za-z]+$/.test(sectionDigits)) {
      pos = closeIdx + 1;
      continue;
    }
    markers.push({
      anchorIdx: startIdx,
      bodyEndOfAnchor: closeIdx + 1,
      chapterNum,
      sectionDigits,
    });
    pos = closeIdx + 1;
  }
  return markers;
}

// ---------------------------------------------------------------------------
// Title + body extraction
// ---------------------------------------------------------------------------

/**
 * Pull the Leadline text (heading) from the section's first paragraph.
 *
 * MS-Word emits `<span\nclass="Leadline">` (newline between the tag name and
 * the class attribute) when a paragraph wraps in the source document. We scan
 * for a `class="Leadline"` (or `class=Leadline`) attribute appearance and walk
 * BACKWARD to the enclosing `<span` opener, then forward to the next `>` that
 * closes the open tag, and finally to the matching `</span>` for the body.
 *
 * Returns the empty string if not found — caller will skip empty-title sections.
 */
function extractLeadline(slice) {
  const attrVariants = ['class="Leadline"', 'class=Leadline'];
  for (const attr of attrVariants) {
    const attrIdx = slice.indexOf(attr);
    if (attrIdx === -1) continue;
    // Walk back to the nearest `<span` opener.
    const spanOpen = slice.lastIndexOf('<span', attrIdx);
    if (spanOpen === -1 || spanOpen > attrIdx) continue;
    // Find the `>` that closes the opening tag (must come AFTER the attr).
    const tagClose = slice.indexOf('>', attrIdx);
    if (tagClose === -1) continue;
    // Find the matching `</span>` for the leadline body.
    const spanClose = slice.indexOf('</span>', tagClose);
    if (spanClose === -1) continue;
    return stripHtml(slice.slice(tagClose + 1, spanClose));
  }
  return '';
}

/**
 * Strip HTML from the raw body and remove SourceNote tail. Truncate to 4000
 * chars (matches AR/CA/SC convention).
 *
 * Two-stage: first strip the SourceNote paragraphs (history block), then
 * tag-strip the remainder.
 */
function stripBody(rawBody) {
  const noHistory = stripSourceNotes(rawBody);
  const decoded = stripHtml(noHistory);
  return decoded.replace(/[\s ]+/g, ' ').trim().slice(0, 4000);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate canonical NRS citation pattern: chapter + dot + section digits.
 *   chapter: digits, optionally followed by a single letter (484A, 484B, …)
 *   section: digits, optionally followed by a single letter
 * Examples accepted: "200.010", "484C.030", "200.5099"
 * Examples rejected: "", "200", "200..010", "abc.def"
 */
export function isValidNvSectionNum(s) {
  if (!s || typeof s !== 'string') return false;
  const parts = s.split('.');
  if (parts.length !== 2) return false;
  if (!/^\d+[A-Za-z]?$/.test(parts[0])) return false;
  if (!/^\d+[A-Za-z]?$/.test(parts[1])) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Citation builder
// ---------------------------------------------------------------------------

/**
 * Convert raw section digits (as they appear in the URL anchor) into the canonical
 * NRS citation form. The anchor `NRS200Sec010` → citation `200.010`. Anchor digits
 * preserve leading zeros — NRS 200.010 is the official form, not "NRS 200.10".
 */
function buildCitation(chapterNum, sectionDigits) {
  return `${chapterNum}.${sectionDigits}`;
}

// ---------------------------------------------------------------------------
// Parse one chapter
// ---------------------------------------------------------------------------

/**
 * Parse a single NV chapter HTML doc and return all sections within.
 *
 * @param {string} html         raw chapter HTML (e.g. body of NRS-200.html)
 * @param {string} chapterNum   display form chapter number (e.g. "200", "484A")
 * @returns {NVSection[]}
 */
export function parseNVChapter(html, chapterNum) {
  const body = extractDocBody(html);
  const markers = findSectionAnchors(body, chapterNum);
  if (markers.length === 0) return [];

  const sections = [];
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const next = markers[i + 1];
    const sliceEnd = next ? next.anchorIdx : body.length;
    const sectionSlice = body.slice(m.anchorIdx, sliceEnd);

    const titleText = extractLeadline(sectionSlice);
    const bodyText = stripBody(sectionSlice);
    const sectionNum = buildCitation(m.chapterNum, m.sectionDigits);

    if (!titleText) continue;
    if (!bodyText) continue;
    if (!isValidNvSectionNum(sectionNum)) continue;

    sections.push({
      chapterNum,
      sectionNum,
      titleText,
      bodyText,
    });
  }
  return sections;
}

/**
 * Parse multiple NV chapters from a {chapterNum, html}[] iterable and concatenate
 * the section arrays. Mirrors parseScChapters.
 *
 * @param {{chapterNum: string, html: string}[]} chapterDocs
 * @returns {NVSection[]}
 */
export function parseNVChapters(chapterDocs) {
  const all = [];
  for (const doc of chapterDocs) {
    const secs = parseNVChapter(doc.html, doc.chapterNum);
    for (const s of secs) all.push(s);
  }
  return all;
}

// ---------------------------------------------------------------------------
// Source URL builders
// ---------------------------------------------------------------------------

/**
 * Build the canonical leg.state.nv.us URL for an NV NRS section.
 * Section URL = chapter doc URL + #NRS{chapter}Sec{sectionDigits}.
 *
 *   buildNVSourceUrl("200.010") → https://www.leg.state.nv.us/NRS/NRS-200.html#NRS200Sec010
 *   buildNVSourceUrl("484C.030") → https://www.leg.state.nv.us/NRS/NRS-484C.html#NRS484CSec030
 *
 * @param {string} sectionNum  e.g. "200.010"
 * @returns {string}
 */
export function buildNVSourceUrl(sectionNum) {
  const dotIdx = sectionNum.indexOf('.');
  if (dotIdx === -1) {
    // Defensive: caller validated already, but never produce a malformed URL.
    return 'https://www.leg.state.nv.us/NRS/index.html';
  }
  const chapter = sectionNum.slice(0, dotIdx);
  const sectionDigits = sectionNum.slice(dotIdx + 1);
  return `https://www.leg.state.nv.us/NRS/NRS-${chapter}.html#NRS${chapter}Sec${sectionDigits}`;
}

/**
 * Build the chapter HTML URL for a given chapter number (display form).
 * Used by the seeder during bulk fetch.
 *
 *   buildNVChapterUrl("200") → https://www.leg.state.nv.us/NRS/NRS-200.html
 *   buildNVChapterUrl("484A") → https://www.leg.state.nv.us/NRS/NRS-484A.html
 *
 * @param {string|number} chapterNum
 * @returns {string}
 */
export function buildNVChapterUrl(chapterNum) {
  return `https://www.leg.state.nv.us/NRS/NRS-${String(chapterNum)}.html`;
}

/**
 * Authoritative chapter cohort for the NV criminal-statute seeder.
 *
 *   200   — Crimes Against the Person (homicide, assault, sexual offenses, kidnapping)
 *   205   — Crimes Against Property (theft, burglary, fraud)
 *   207   — Miscellaneous Crimes
 *   453   — Controlled Substances
 *   484A  — Traffic Laws Generally (DUI definitional + procedural)
 *   484B  — Rules of the Road
 *   484C  — Driving Under the Influence
 *   484D  — Equipment / vehicle
 *   484E  — Accidents and Accident Reports (hit-and-run)
 *
 * These nine chapters cover the criminal-defense surface area we need for INAA's
 * NV intake / playbook generation. Verified live (2026-05-02) — all nine return
 * 200 OK with `<a name=NRS{N}Sec*>` anchors present.
 */
export const NV_CHAPTERS = [
  '200',
  '205',
  '207',
  '453',
  '484A',
  '484B',
  '484C',
  '484D',
  '484E',
];
