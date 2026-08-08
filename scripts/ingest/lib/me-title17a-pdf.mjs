// Template: scripts/ingest/lib/ar-xml.mjs (per-state parser pattern)
// Pattern: cl-bulk-data-defensive #19 — single full-Title PDF as bulk source
// csv-bulk-checked: https://legislature.maine.gov/statutes/17-A/title17-A.pdf
//   (~1.2 MB, official state code, single full-Title-17-A PDF, born-digital text layer)
//
// Maine Title 17-A — MAINE CRIMINAL CODE.
//
// Format observations (verified against live PDF, 2026-05-02):
//   Title page: "MRS Title 17-A. MAINE CRIMINAL CODE / Generated 01.05.2026"
//   Section header line: "§1. Title; effective date; severability"
//     - Literal § U+00A7
//     - NO space between § and section number (contrast with DE)
//     - Section number: digits, optional "-A".."-Z" suffix, optional ".N"
//       e.g. "1", "4-A", "1252", "1252-C", "501-A"
//     - Period + space + title text on the SAME line
//   Body: free text. Each subsection-paragraph ends with a bracket cite like
//     "[PL 1975, c. 740, §9-A (RPR).]" — KEEP these.
//   Per-section trailing block: "SECTION HISTORY" + multi-line legislative
//     citation list — KEEP. It's part of the canonical text and the source
//     of truth for amendments.
//   Page-break artifacts: '-- N of 315 --' lines.
//   Repealed sections: header line is followed only by a "[PL ..., (RP).]"
//     line and no real body. minBodyChars=20 will drop them — that is OK;
//     repealed sections are not enforceable and we don't want to seed them
//     as if they were live statutes.
//
// COPYRIGHT POSTURE (DOCUMENTED — survey row 42):
//   Maine asserts copyright on its codified text via the Office of the
//   Revisor of Statutes. Two facts that bear on this:
//     1. Banks v. Manchester (1888) and Georgia v. Public.Resource.Org
//        (SCOTUS 2020) hold that the text of state law itself is not
//        copyrightable. Annotations and editorial apparatus may be; the
//        statute body is not.
//     2. The PDF distributed by legislature.maine.gov contains the
//        statute body PLUS a "Generated" date stamp and a top-of-page
//        "MRS Title 17-A" heading — these are not part of the statutory
//        text and we strip them via pageBreakRe + body extraction.
//   Mitigation applied here:
//     - source_url points to the official ME legislature URL (not a
//       derivative or scrape).
//     - Seeder header documents the copyright claim and our reliance on
//        Banks/Georgia.
//     - We do NOT redistribute the PDF; we ingest the statutory text
//        only, attribute the source_url, and serve via fair-use research
//        access in a defendant-information context.
//   No further mitigation is required at the harness layer; this is an
//   operational/legal decision documented in the seeder header and in
//   docs/plans/2026-05-02-wave1c-design-report.md.
//
// Parser: thin wrapper that calls parseStatuteSections() with ME config and
// stamps a state-anchored source URL on every row.

import { parseStatuteSections } from '../../lib/pdf-statute-harness.mjs';

// Stable PDF URL — the only authoritative bulk source.
export const ME_TITLE17A_PDF_URL =
  'https://legislature.maine.gov/statutes/17-A/title17-A.pdf';

// Section header regex.
//   Group 1: section number — digits, optional "-A"-"-Z" suffix, optional ".N"
//     e.g. "1", "4-A", "1252", "1252-C", "501-A", "210-A"
//   Group 2: title text — everything after the period+space on the header line
//
// Anchored at line start. NO space between § and number.
const ME_SECTION_RE = /^§(\d{1,4}(?:-[A-Z])?(?:\.\d+)?)\.\s+(.+)$/;

/** @type {import('../../lib/pdf-statute-harness.mjs').ParseConfig} */
export const ME_CONFIG = {
  state: 'ME',
  sectionRe: ME_SECTION_RE,
  // ME uses U+2011 non-breaking hyphen in some places (e.g. "17‑A") and
  // U+2013 en-dash in others. normalizeEnDash collapses U+2013 only;
  // the section-num regex uses ASCII '-' so anything in section IDs that
  // is U+2013 will be normalized; U+2011 occurs in body text only and
  // is fine to keep as-is.
  normalizeEnDash: true,
  minBodyChars: 20,
};

/**
 * Parse all sections from the ME Title 17-A PDF text.
 * @param {string} text  output of extractStatuteText() on the title17-A.pdf buffer
 * @returns {import('../../lib/pdf-statute-harness.mjs').StatuteSection[]}
 */
export function parseTitle17A(text) {
  return parseStatuteSections(text, ME_CONFIG);
}

/**
 * Build the authoritative state-leg URL for a given section number.
 *
 * Per legislature.maine.gov convention, individual sections also live at
 *   https://legislature.maine.gov/statutes/17-A/title17-Asec{N}.html
 * but the mapping is not 1:1 reliable for suffixed sections (e.g. 4-A).
 * We anchor every row at the title-level PDF — the same pattern MD and
 * AR use.
 *
 * @param {string} _sectionNum
 * @returns {string}
 */
export function buildMeSourceUrl(_sectionNum) {
  return ME_TITLE17A_PDF_URL;
}
