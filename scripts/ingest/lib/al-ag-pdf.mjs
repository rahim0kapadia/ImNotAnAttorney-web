// Template: scripts/ingest/lib/de-title11-pdf.mjs (Wave 1C per-state PDF parser pattern)
// Pattern: cl-bulk-data-defensive #19 — single full-Title PDF as bulk source
// csv-bulk-checked: https://www.alabamaag.gov/wp-content/uploads/2024/11/AL_CRIM_-LAWS_2024_Edition.pdf
//   (~10.6 MB, 998 pages, 2024 Edition, AG-republished Title 13A + selected
//   adjacent criminal-procedure titles. We ingest Title 13A only here; the
//   other titles in the same PDF are out of scope for this seeder.)
//
// Alabama Title 13A — Criminal Code.
//
// Source: Alabama Attorney General's Office bulk PDF, "CRIMINAL LAWS OF
// ALABAMA, 2024 EDITION", reprinted from the Code of Alabama 1975 + the
// 2024 Cumulative Supplement.
//
// Per Carl Malamud / Georgia v. Public.Resource.Org, Inc., 590 U.S. 255
// (2020): primary law (statutes, including AG republications of state
// codes) is uncopyrightable government work. The 2020 ruling specifically
// rejected Georgia's attempt to copyright OCGA annotations; the AL AG's
// republication of the Code of Alabama is on even firmer footing — the
// underlying statutes are public domain, and the AG is republishing them
// as a government function. The Thomson Reuters editorial annotations
// inside the PDF (Casenotes, Amendment Notes, etc.) are the only
// arguably-copyrightable elements; this parser extracts only the
// statutory section bodies and drops the editorial layer at the page
// boundary (page-break markers strip out headers).
//
// Format observations (verified against live PDF, 2026-05-02):
//   Cover page: "CRIMINAL LAWS OF ALABAMA / 2024 EDITION /
//     Reprinted from the Code of Alabama 1975 / and the 2024 Cumulative
//     Supplement"
//   Section header line (CRITICAL — uses U+2013 EN-DASH between numeric
//   segments, not ASCII hyphen): "§ 13A–1–1. <TAB> Short title."
//     - Literal § U+00A7
//     - ASCII space between § and section number
//     - Section number: <title>(–|-)<chapter>(–|-)<section>[suffix]
//       - title: digits with optional trailing letter (13A, 15, 20A, 30A)
//       - chapter: digits with optional trailing letter (5A, 9B, 9C)
//       - section: digits with optional .NN sub-decimal AND/OR
//         trailing letter (e.g. 6-139.1, 8-2A, 5A-9)
//     - Period + (whitespace, often TAB U+0009) + title text on SAME line
//   Body: free text below header until next section header.
//   Page-break artifacts: '-- N of 998 --' lines AND short bare
//     header lines like '7' or 'PRINCIPLES OF CRIMINAL LIABILITY'
//     (those become orphan content lines but live INSIDE the body — we
//     keep them, they're harmless).
//   Citation footer per section: '(Acts 1977, No. 607, p. 812, § 101.)'
//     — KEEP these; canonical statute body.
//
// The PDF actually contains 1,597 total section headers across MULTIPLE
// titles (13A, 15, 20, 26, 30, 31, 32, 38). This parser ingests Title 13A
// ONLY. The other titles are out of scope for this seeder; a future PR
// can add them.
//
// Parser: thin wrapper that calls parseStatuteSections() with AL config,
// filters to Title-13A-only rows, and stamps a state-anchored source URL
// on every row.

import { parseStatuteSections } from '../../lib/pdf-statute-harness.mjs';

// Stable PDF URL — the only authoritative bulk source.
export const AL_TITLE13A_PDF_URL =
  'https://www.alabamaag.gov/wp-content/uploads/2024/11/AL_CRIM_-LAWS_2024_Edition.pdf';

// Section header regex (post-en-dash-normalize: U+2013 has been replaced
// by ASCII hyphen by the harness before this regex runs).
//
//   Group 1: section number — <title>-<chapter>-<section>[suffix]
//     Examples: 13A-1-1, 13A-6-139.1, 13A-8-2A, 15-5A-9
//   Group 2: title text — everything after the period+whitespace on the
//     header line (note: AL uses TAB after the period, not space; \s
//     covers both)
//
// Anchored at line start. Trailing period mandatory. Title text must be
// non-empty (we drop "Reserved" entries via the body-min-length filter
// downstream).
const AL_SECTION_RE =
  /^§\s+(\d{1,3}[A-Z]?-\d{1,3}[A-Z]?-\d{1,4}(?:\.\d+)?[A-Za-z]?)\.\s*(.+)$/;

/** @type {import('../../lib/pdf-statute-harness.mjs').ParseConfig} */
export const AL_CONFIG = {
  state: 'AL',
  sectionRe: AL_SECTION_RE,
  // CRITICAL — AL section IDs use U+2013 EN-DASH between numeric segments.
  // Without this, the section regex (which uses ASCII hyphen) won't match
  // a single section.
  normalizeEnDash: true,
  // 20 chars drops Reserved/Repealed-without-body fragments (e.g.
  // § 13A-12-230 has body "" and § 13A-6-139.1 has body "May 23, 2019.").
  minBodyChars: 20,
};

/**
 * Parse Title-13A sections only from the AL AG criminal-laws PDF text.
 *
 * The PDF contains ~1,597 sections across multiple titles. This filters
 * to Title 13A (Criminal Code) only — the other titles are out of scope
 * for this seeder.
 *
 * @param {string} text  output of extractStatuteText() on the AG PDF buffer
 * @returns {import('../../lib/pdf-statute-harness.mjs').StatuteSection[]}
 */
export function parseTitle13A(text) {
  const all = parseStatuteSections(text, AL_CONFIG);
  return all.filter((s) => /^13A-/.test(s.sectionNum));
}

/**
 * Build the authoritative AG-republished URL for a given section number.
 *
 * The AL AG bulk PDF has no per-section anchor inside it. The cited PDF
 * IS the authoritative source — pointing every row at it is truthful and
 * idempotent. The Alabama Legislature also publishes per-section pages
 * under https://alison.legislature.state.al.us/ but those are
 * Cloudflare-walled (which is why we pivoted to the AG bulk PDF in the
 * first place). The AG PDF is the survivable verification anchor.
 *
 * @param {string} _sectionNum
 * @returns {string}
 */
export function buildAlSourceUrl(_sectionNum) {
  return AL_TITLE13A_PDF_URL;
}
