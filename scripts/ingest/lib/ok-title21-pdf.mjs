// Template: scripts/ingest/lib/ar-xml.mjs (per-state parser pattern)
// Pattern: cl-bulk-data-defensive #19 — single full-Title PDF as bulk source
// csv-bulk-checked: https://www.oklegislature.gov/OK_Statutes/CompleteTitles/os21.pdf
//   (~3.5 MB / 884 pages, official state code, single full-Title-21 PDF,
//    born-digital text layer, public-domain via state authorship)
//
// Oklahoma Title 21 — Crimes and Punishments.
//
// Format observations (verified against live PDF, 2026-05-02):
//   Title page: "OKLAHOMA STATUTES / TITLE 21. CRIMES AND PUNISHMENTS"
//   First ~50k chars: TABLE OF CONTENTS — every line matches the section
//     regex but trailing dot leaders take the place of the title text and
//     body is empty. minBodyChars=20 drops these. Seeder dedup keeps the
//     real (longer-body) instance found later in the document.
//   Section header line: "§21-1. Title of code."
//     - Literal § U+00A7
//     - NO space between § and section number
//     - Section number always starts with title prefix "21-"
//     - Section can have:
//         * decimal subsection: "21-13.1"
//         * versioned: "21-13.1v1", "21-13.1v2"
//         * letter suffix: "21-540A", "21-540B", "21-20A"
//         * compound: "21-1289.16-1" (range markers)
//     - Period + space + title text on the SAME line
//   Body: free text, sometimes with bracket cites like "Added by Laws 2024,
//     c. 12, § 1, eff. Nov. 1, 2024."
//   Page-break artifacts: '-- N of 884 --' lines.
//   Repealed sections: title line says "Repealed by Laws YYYY, ..." with
//     no real body. minBodyChars=20 drops most; the ones that DO have body
//     usually contain the repealing-act citation only — that is acceptable
//     statutory text.
//
// Parser: thin wrapper that calls parseStatuteSections() with OK config and
// stamps a state-anchored source URL on every row.

import { parseStatuteSections } from '../../lib/pdf-statute-harness.mjs';

// Stable PDF URL — the only authoritative bulk source.
export const OK_TITLE21_PDF_URL =
  'https://www.oklegislature.gov/OK_Statutes/CompleteTitles/os21.pdf';

// Section header regex.
//   Group 1: section number — full form "21-N[.M][vK][-J]" with optional letter
//     suffix variants. Mirrors the OK_CONFIG that already lives in the legacy
//     fetch-statute-pdf.mjs harness; ported verbatim.
//   Group 2: title text — everything after the period+space on the header line
const OK_SECTION_RE = /^§(\d+[-–]\d+(?:\.\d+)*[A-Z]?(?:v\d+)?(?:-\d+)?)\.\s+(.+)$/;

/** @type {import('../../lib/pdf-statute-harness.mjs').ParseConfig} */
export const OK_CONFIG = {
  state: 'OK',
  sectionRe: OK_SECTION_RE,
  // OK uses ASCII hyphens in section numbers; en-dash never observed.
  normalizeEnDash: false,
  minBodyChars: 20,
};

/**
 * Parse all sections from the OK Title 21 PDF text.
 * @param {string} text  output of extractStatuteText() on the os21.pdf buffer
 * @returns {import('../../lib/pdf-statute-harness.mjs').StatuteSection[]}
 */
export function parseTitle21(text) {
  return parseStatuteSections(text, OK_CONFIG);
}

/**
 * Build the authoritative state-leg URL for a given section number.
 *
 * Oklahoma's online statute UI exists at oscn.net but the URL grammar is
 * dynamic-form-only (token=...). The single-PDF source is the only stable
 * authoritative deep-link, so every row anchors there — same pattern as
 * MD/DE/ME.
 *
 * @param {string} _sectionNum
 * @returns {string}
 */
export function buildOkSourceUrl(_sectionNum) {
  return OK_TITLE21_PDF_URL;
}
