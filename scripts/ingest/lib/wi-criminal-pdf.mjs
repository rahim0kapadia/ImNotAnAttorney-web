// Template: scripts/ingest/lib/de-title11-pdf.mjs (per-state PDF parser pattern)
// Pattern: cl-bulk-data-defensive #19 — per-chapter PDFs as bulk source (no API loops)
// csv-bulk-checked: https://docs.legis.wisconsin.gov/statutes/statutes/{N}.pdf
//   (per-chapter PDFs, official Wisconsin Legislative Reference Bureau, born-digital
//    text layer; chapters 939-948 cover the modern criminal code)
//
// Wisconsin Criminal Code (Chapters 939-948) — Wave 2 ingest.
//
// Format observations (verified against live PDF chapter 940, 2026-05-02):
//   Source: per-chapter PDF, one PDF per chapter at
//     https://docs.legis.wisconsin.gov/statutes/statutes/{N}.pdf
//   Cohort: 939, 940, 941, 942, 943, 944, 945, 946, 947, 948
//     - 939 = General Provisions
//     - 940 = Crimes Against Life and Bodily Security
//     - 941 = Crimes Against Public Health and Safety
//     - 942 = Crimes Against Reputation, Privacy, Civil Liberties
//     - 943 = Crimes Against Property
//     - 944 = Crimes Against Sexual Morality
//     - 945 = Gambling
//     - 946 = Crimes Against Government and Its Administration
//     - 947 = Crimes Against Public Peace, Order, and Other Interests
//     - 948 = Crimes Against Children
//   Section header line (extracted text shape): "940.01 First-degree intentional homicide."
//     - Chapter.Section dot syntax (no § symbol on the header line in extracted text)
//     - Section number format: {chapter}.{NN}[(suffix)] — e.g.
//         "940.01", "940.225", "940.225(1)", "939.45", "948.02"
//       Wisconsin uses dotted decimal subsection nums in the wild but the
//       parser-level header is the bare "{chapter}.{NN}" form. Subsection
//       letters/parens appear inside the body text of a section.
//     - Title text follows on the same line, terminated by period.
//   Body: free text below header until next section header.
//     Includes "History:" footer noting source acts (preserved as part of
//     canonical body to match DE shape).
//
// Parser shape: thin wrapper around parseStatuteSections() with a WI-specific
// regex. The seeder calls parseChapter(text, chapterNum) once per chapter PDF
// and concatenates results. The {chapter} prefix in the regex is parameterized
// per-call so a 940.pdf parse will not slurp 941-style headers if pages bleed
// across chapters in any cross-chapter PDF that exists.

import { parseStatuteSections } from '../../lib/pdf-statute-harness.mjs';

// ---------------------------------------------------------------------------
// Cohort + URL builders
// ---------------------------------------------------------------------------

/**
 * Wisconsin criminal-code chapter cohort.
 * Ordered to match dispatch order in the seeder.
 */
export const WI_CRIMINAL_CHAPTERS = [
  '939', '940', '941', '942', '943',
  '944', '945', '946', '947', '948',
];

/**
 * Build the per-chapter PDF URL.
 * @param {string|number} chapterNum  e.g. "940" or 940
 * @returns {string}
 */
export function buildWiChapterPdfUrl(chapterNum) {
  if (!/^\d+$/.test(String(chapterNum))) {
    throw new Error(`buildWiChapterPdfUrl: invalid chapterNum "${chapterNum}"`);
  }
  return `https://docs.legis.wisconsin.gov/statutes/statutes/${chapterNum}.pdf`;
}

/**
 * Build the canonical state-leg source URL for a given section (e.g. "940.01").
 * Wisconsin's per-chapter PDF has no fragment anchor inside it, so every row
 * for a chapter points at the chapter PDF — same truthful-anchor pattern as
 * DE buildDeSourceUrl().
 *
 * @param {string} sectionNum  e.g. "940.01"
 * @returns {string}
 */
export function buildWiSourceUrl(sectionNum) {
  const chapter = String(sectionNum).split('.')[0];
  if (!/^\d+$/.test(chapter)) {
    throw new Error(`buildWiSourceUrl: malformed sectionNum "${sectionNum}"`);
  }
  return buildWiChapterPdfUrl(chapter);
}

// ---------------------------------------------------------------------------
// Per-chapter section regex factory
// ---------------------------------------------------------------------------

/**
 * Build a regex that matches WI section headers for a SPECIFIC chapter.
 *
 * Header shape (post-PDF-text-extraction, two observed variants):
 *   1. Bare TOC entry:    "940.01 First-degree intentional homicide."
 *      (line-end terminator is `.` — appears in TOC at front of chapter)
 *   2. Body header:       "940.01 First-degree intentional homicide. (1) OF-"
 *      (period after title, then subsection marker `(N)` continues on same
 *      line; this is the canonical statute-body header)
 *
 * Both variants share: line-anchored "{chapter}.{section} {title}." prefix.
 * The body variant has trailing content; the TOC variant ends at the period.
 *
 * Caller (parseStatuteSections in the harness) consumes ALL matched headers
 * in document order, then bodies are the lines between consecutive headers.
 * Because TOC entries appear FIRST and their bodies (= lines until the next
 * TOC entry, which is the very next line) are too short to clear minBodyChars,
 * TOC entries get filtered. Body-variant headers appear LATER and capture the
 * full statute text up to the next body-variant header.
 *
 * Group 1 = section number (e.g. "940.01")
 * Group 2 = title text (e.g. "First-degree intentional homicide")
 *
 * Anchored at line start. Title text captured lazily up to the FIRST period.
 * Trailing content after the period is allowed (catches body-variant headers).
 * Body-text cross-references like "see 940.05:" do NOT match because they
 * lack the line-start anchor (they appear mid-line in body paragraphs).
 *
 * @param {string|number} chapterNum
 * @returns {RegExp}
 */
export function buildWiSectionRe(chapterNum) {
  if (!/^\d+$/.test(String(chapterNum))) {
    throw new Error(`buildWiSectionRe: invalid chapterNum "${chapterNum}"`);
  }
  // Section number: {chapter}.{1-4 digits}, optionally followed by a single
  // parenthesized subsection letter/digit (rare in WI body headers).
  // Title: anything up to first period; trailing content after period allowed
  // to catch body-variant headers like "...homicide. (1) OFFENSES."
  return new RegExp(
    `^(${chapterNum}\\.\\d{1,4}(?:\\([0-9a-z]+\\))?)\\s+([^.\\n]+?)\\.(?:\\s|$)`,
  );
}

// ---------------------------------------------------------------------------
// Per-chapter parse config
// ---------------------------------------------------------------------------

/**
 * Build a ParseConfig for a single WI chapter. Caller passes the chapter
 * number; each chapter parse uses its own config so cross-chapter section
 * headers cannot bleed.
 *
 * @param {string|number} chapterNum
 * @returns {import('../../lib/pdf-statute-harness.mjs').ParseConfig}
 */
export function buildWiConfig(chapterNum) {
  return {
    state: 'WI',
    sectionRe: buildWiSectionRe(chapterNum),
    // WI PDFs use ASCII hyphens in section ranges; no en-dash normalization.
    normalizeEnDash: false,
    // Filter TOC-style entries (header line repeated at front of doc with
    // no body). 30 chars is enough to drop bare TOC echoes while preserving
    // every real statute section.
    minBodyChars: 30,
    // Default page-break regex from the harness handles "-- N of M --" and
    // bare "- N -" page markers. WI does not use these but the default is a
    // safe no-op; bare page numbers in the WI margin extract are short
    // enough to not derail body parse.
  };
}

// ---------------------------------------------------------------------------
// parseChapter
// ---------------------------------------------------------------------------

/**
 * Parse all sections from a single Wisconsin chapter PDF's extracted text.
 *
 * @param {string} text       output of extractStatuteText() on the chapter PDF
 * @param {string|number} chapterNum  e.g. "940"
 * @returns {import('../../lib/pdf-statute-harness.mjs').StatuteSection[]}
 */
export function parseChapter(text, chapterNum) {
  return parseStatuteSections(text, buildWiConfig(chapterNum));
}
