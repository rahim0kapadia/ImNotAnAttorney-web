// Template: scripts/ingest/lib/de-title11-pdf.mjs (Wave 1C single-PDF parser)
// Pattern: cl-bulk-data-defensive #19 — single full-Title PDF as bulk source
// csv-bulk-checked: https://legislature.mi.gov/documents/mcl/pdf/mcl-chap750.pdf
//   (~2.16 MB, 459 pages, official Michigan Legislature, born-digital text layer,
//   actively maintained — Last-Modified 2026-05-02)
//
// Michigan Compiled Laws — Chapter 750 (Penal Code, Act 328 of 1931).
//
// Format observations (verified against live PDF, 2026-05-02):
//   Front matter: chapter title + act preamble + History line + first People-of-
//     Michigan-enact sentence + introductory definitional sections.
//   Section header line: "750.<NNN>[<letter>] <Title text...>"
//     - Section ID: dotted form "750.<digits>" with optional trailing single
//       lowercase letter (e.g. "750.1", "750.10a", "750.520b", "750.81d")
//     - Single ASCII space between section ID and title text (NOT a period —
//       distinct from DE's "§ 101. Short title." format)
//     - Title may wrap to next line on long entries; wrapped portion becomes
//       part of section body (mirrors DE pattern)
//   Multi-section / range headers (NOT real sections — excluded by regex):
//     "750.11, 750.12 Repealed." (comma after first section ID — excluded)
//     "750.19-750.24 Repealed."  (hyphen after first section ID — excluded)
//     The /\s/ requirement after the optional letter rejects both forms because
//     "," and "-" are not whitespace.
//   Body: free text below header until next section header. Includes
//     "Sec. N." line, prose, and "History:" / "Compiler's Notes:" / "Former Law:"
//     citation footers — all kept (canonical part of section).
//   Page-break artifacts (each appears 459 times, once per page):
//     "Rendered Saturday, May 2, 2026 \tPage N of 459 \tMichigan Compiled Laws..."
//     "Courtesy of legislature.mi.gov"
//     "-- N of 459 --"
//   The default harness pageBreakRe handles "-- N of M --". MI extends with a
//   custom regex that ALSO matches the Rendered/Courtesy lines.
//
// Source URL stamping: every row gets the same authoritative title-level PDF
// URL (no per-section anchor in the PDF; same approach as DE).

import { parseStatuteSections } from '../../lib/pdf-statute-harness.mjs';

// Stable PDF URL — official Michigan Legislature, the only authoritative bulk source.
export const MI_CHAPTER750_PDF_URL =
  'https://legislature.mi.gov/documents/mcl/pdf/mcl-chap750.pdf';

// Section header regex.
//   Group 1: section ID — "750.<digits>[<single lowercase letter>]"
//     e.g. "750.1", "750.10a", "750.520b", "750.81d"
//   Group 2: title text — everything after the required single space following
//     the section ID
//
// Anchored at line start. Single ASCII whitespace required after the section ID
// to reject comma- / hyphen-prefixed range headers (`750.11, 750.12 Repealed.`,
// `750.19-750.24 Repealed.`). Title text must START with a non-whitespace
// non-digit character to avoid matching a body line that happens to begin with
// "750.NNN " followed by punctuation; in practice all real MI section titles
// begin with an uppercase letter or a quote glyph.
const MI_SECTION_RE = /^(750\.\d{1,4}[a-z]?)\s+([A-Z""''].*)$/;

/** @type {import('../../lib/pdf-statute-harness.mjs').ParseConfig} */
export const MI_CONFIG = {
  state: 'MI',
  sectionRe: MI_SECTION_RE,
  // Em/en-dashes appear in body text but not in section IDs — leave alone.
  normalizeEnDash: false,
  // Repealed sections are ~50 chars (just history line); 20 is safe.
  minBodyChars: 20,
  // Strip three classes of page-break artifacts:
  //   1. "-- N of M --" page markers (default behavior)
  //   2. "Rendered <Day>, <Month> <D>, <YYYY> ... Michigan Compiled Laws ..."
  //   3. "Courtesy of legislature.mi.gov"
  pageBreakRe:
    /^--\s*\d+\s+of\s+\d+\s*--$|^Rendered\s+\w+,\s+\w+\s+\d+,\s+\d{4}\b.*Michigan\s+Compiled\s+Laws\b.*$|^Courtesy of legislature\.mi\.gov\s*$/,
};

/**
 * Parse all sections from MI Chapter 750 PDF text.
 * @param {string} text  output of extractStatuteText() on the mcl-chap750.pdf buffer
 * @returns {import('../../lib/pdf-statute-harness.mjs').StatuteSection[]}
 */
export function parseChapter750(text) {
  return parseStatuteSections(text, MI_CONFIG);
}

/**
 * Build the authoritative source URL for a given MI Chapter 750 section.
 *
 * The Michigan Legislature single-PDF source has no per-section anchor inside
 * it (same as DE). The legislature.mi.gov per-section HTML pages exist but are
 * served via a JS-rendered SPA that requires session state — unsuitable as a
 * stable verification URL. Pointing every row at the title-level PDF is
 * truthful, idempotent, and matches the DE/ME/OK Wave 1C convention.
 *
 * Note: the prior Justia-based parser (mi-justia-html.mjs) returned per-section
 * Justia URLs that required a division Roman numeral. With Justia walled by
 * Cloudflare WAF and replaced by the legislature.mi.gov bulk PDF, the
 * authoritative URL is the legislature's PDF itself.
 *
 * @param {string} _sectionNum  e.g. "750.316" (unused; kept for caller parity)
 * @returns {string}
 */
export function buildMiSourceUrl(_sectionNum) {
  return MI_CHAPTER750_PDF_URL;
}
