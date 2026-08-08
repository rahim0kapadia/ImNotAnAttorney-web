// Template: scripts/ingest/lib/ar-xml.mjs (per-state parser pattern)
// Pattern: cl-bulk-data-defensive #19 — single full-Title PDF as bulk source
// csv-bulk-checked: https://delcode.delaware.gov/title11/title11.pdf  (~2 MB,
//   official state code, single full-Title-11 PDF, born-digital text layer)
//
// Delaware Title 11 — Crimes and Criminal Procedure.
//
// Format observations (verified against live PDF, 2026-05-02):
//   Title page: "Title 11 / Crimes and Criminal Procedure" + LexisNexis-credit
//     notice + DISCLAIMER paragraph.
//   Section header line: "§ 101. Short title."
//     - Literal § U+00A7
//     - Single ASCII space between § and section number
//     - Section number: 1-4 digits with optional letter/letter-digit suffix
//       (e.g. "101", "1448A", "4108A", "8514E")
//     - Period + space + title text on the SAME line
//   Body: free text below header until next section header.
//   Page-break artifacts: '-- N of 491 --' lines.
//   Citation footer per section: '(11 Del. C. 1953, § 101; 58 Del. Laws, c. 497, § 1.)'
//     — KEEP these; they are part of the canonical statute body.
//
// Parser: thin wrapper that calls parseStatuteSections() with DE config and
// stamps a state-anchored source URL on every row.

import { parseStatuteSections } from '../../lib/pdf-statute-harness.mjs';

// Stable PDF URL — the only authoritative bulk source.
export const DE_TITLE11_PDF_URL = 'https://delcode.delaware.gov/title11/title11.pdf';

// Section header regex.
//   Group 1: section number — digits, optional .NN, optional trailing letter+digits
//     e.g. "101", "1448A", "4108A", "8514E"
//   Group 2: title text — everything after the period+space on the header line
//
// Anchored at line start. Single ASCII space between § and number is required
// (vs. MD where § is glued to the digit). Trailing period mandatory.
const DE_SECTION_RE = /^§\s+(\d{1,4}[A-Z]?(?:\.\d+)?[A-Z]?)\.\s+(.+)$/;

/** @type {import('../../lib/pdf-statute-harness.mjs').ParseConfig} */
export const DE_CONFIG = {
  state: 'DE',
  sectionRe: DE_SECTION_RE,
  // No en-dashes observed in DE section numbers.
  normalizeEnDash: false,
  // 20 chars is enough to drop TOC entries (which the DE PDF doesn't even
  // emit as section-style lines, so this is belt + suspenders).
  minBodyChars: 20,
};

/**
 * Parse all sections from the DE Title 11 PDF text.
 * @param {string} text  output of extractStatuteText() on the title11.pdf buffer
 * @returns {import('../../lib/pdf-statute-harness.mjs').StatuteSection[]}
 */
export function parseTitle11(text) {
  return parseStatuteSections(text, DE_CONFIG);
}

/**
 * Build the authoritative state-leg URL for a given section number.
 *
 * The Delaware single-PDF source has no per-section anchor inside it. Per the
 * survey doc (line 32), DE also publishes per-chapter HTML at
 *   https://delcode.delaware.gov/title11/cNNN/index.html
 * but mapping section -> chapter requires a chapter index we don't have at
 * parse time. Pointing every row at the authoritative title-level PDF is
 * truthful and idempotent; the source_url is a verification anchor, not a
 * deep-link.
 *
 * @param {string} _sectionNum
 * @returns {string}
 */
export function buildDeSourceUrl(_sectionNum) {
  return DE_TITLE11_PDF_URL;
}
