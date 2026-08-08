// Template: scripts/ingest/lib/de-title11-pdf.mjs (per-state PDF parser pattern)
// Pattern: cl-bulk-data-defensive #19 — single full-Article PDF as bulk source
// csv-bulk-checked: https://mgaleg.maryland.gov/2026RS/Statute_Web/gcr/gcr.pdf
//   (~3 MB, 671 pages, born-digital text layer; official Maryland General
//   Assembly publication, 2026 Regular Session, Criminal Law Article)
//
// Maryland Criminal Law Article (gcr) — full-Article ingest.
//
// Format observations (verified against live PDF, 2026-05-02):
//   Heading line:     "Article - Criminal Law"  (once at top)
//   Section header:   "§1–101."
//     - Literal § U+00A7
//     - NO space between § and the section number (vs. DE which has one)
//     - Section number format: <title>–<section>[.<sub>] where the dash is
//       en-dash U+2013, e.g. "1–101", "5–612", "11–306", "13–2628",
//       "5–404.1"
//     - Title text is NOT on the same line — header line is just the anchor.
//       Body text begins on the next line.
//     - Trailing period mandatory.
//   Page-break artifacts:
//     - "-- N of 671 --"  (671 occurrences)
//     - "- N -"           (671 occurrences, top-of-page header)
//     Both are stripped by the harness DEFAULT_PAGE_BREAK_RE.
//   Inline statute citations within body text appear as "§ N–NNN" (with a
//   space after §) — these will NOT match our line-anchored header regex
//   because we require the digit immediately after § (no space).
//
// Parser: thin wrapper that calls parseStatuteSections() with MD config and
// stamps a per-section state-leg URL on every row.

import { parseStatuteSections } from '../../lib/pdf-statute-harness.mjs';

// Stable PDF URL — official Maryland General Assembly publication for the
// 2026 Regular Session Criminal Law Article. The URL pattern is
// `<session>/Statute_Web/<article>/<article>.pdf`.
export const MD_CR_PDF_URL =
  'https://mgaleg.maryland.gov/2026RS/Statute_Web/gcr/gcr.pdf';

// Section header regex.
//   Group 1: section number — `<title>–<section>[.<sub>]` where digits split
//     by a single en-dash or ASCII hyphen (parser may have already
//     normalized en-dashes to hyphens; we accept both for safety).
//   Group 2: empty (MD does not put title text on the header line).
//
// Anchored at line start. NO space between § and the digit (this is what
// distinguishes a header line from an inline body citation like "§ 4–204
// of this subtitle").
const MD_SECTION_RE = /^§(\d+[–-]\d+(?:\.\d+)?)\.\s*()$/;

/** @type {import('../../lib/pdf-statute-harness.mjs').ParseConfig} */
export const MD_CR_CONFIG = {
  state: 'MD',
  sectionRe: MD_SECTION_RE,
  // Normalize U+2013 en-dash so downstream consumers see ASCII hyphen.
  normalizeEnDash: true,
  // 20 chars filters TOC-like headers with no body. MD's PDF doesn't emit a
  // separate TOC table, but belt + suspenders.
  minBodyChars: 20,
};

/**
 * Parse all sections from the MD Criminal Law Article PDF text.
 * @param {string} text  output of extractStatuteText() on gcr.pdf buffer
 * @returns {import('../../lib/pdf-statute-harness.mjs').StatuteSection[]}
 */
export function parseCriminalLawArticle(text) {
  return parseStatuteSections(text, MD_CR_CONFIG);
}

/**
 * Build the authoritative per-section state-leg URL.
 *
 * MGA exposes a public StatuteText endpoint that takes the article slug
 * (`gcr` for Criminal Law) plus the section number with an ASCII hyphen
 * (NOT the en-dash used in the PDF text). Verified live 2026-05-02:
 *   GET https://mgaleg.maryland.gov/mgawebsite/laws/StatuteText?article=gcr&section=1-101
 *   → 200, ~63 KB rendered HTML.
 *
 * Internally the parser already normalizes en-dashes to ASCII hyphens, so
 * sectionNum arrives as e.g. "1-101". We defensively replace en-dash again
 * in case a caller passes a raw section number.
 *
 * @param {string} sectionNum  e.g. "1-101", "5-612", "13-2628"
 * @returns {string}
 */
export function buildMdSourceUrl(sectionNum) {
  const ascii = String(sectionNum).replace(/–/g, '-');
  return `https://mgaleg.maryland.gov/mgawebsite/laws/StatuteText?article=gcr&section=${ascii}`;
}
