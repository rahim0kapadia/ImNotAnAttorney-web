// Template: scripts/ingest/lib/me-title17a-pdf.mjs (sibling pdf-statute-harness consumer)
// Pattern: cl-bulk-data-defensive #19 — single-PDF-per-chapter as bulk source
// csv-bulk-checked: https://www.legis.iowa.gov/docs/code/<chapter>.pdf
//   Iowa publishes per-chapter Code PDFs (one PDF per chapter, born-digital text).
//   Title XVI (Criminal Law and Procedure) lives in chapters 700-803 with the
//   substantive offenses concentrated in 707-725. Verified URL pattern via the
//   Iowa Code online repository (legis.iowa.gov/docs/code/).
//
// Iowa Code Title XVI (Criminal Law) — per-chapter PDF parser.
//
// Coverage cohort (offenses against persons, property, public order, drug):
//   707  Homicide and Related Crimes
//   708  Assaults
//   709  Sexual Abuse
//   710  Kidnapping
//   711  Robbery
//   712  Arson
//   714  Theft, Fraud, and Related Offenses
//   716  Damage and Trespass
//   718  Offenses Against Government
//   719  Obstructing Justice
//   720  Conspiracy and Solicitation Crimes
//   723  Riots and Public Disturbances
//   724  Weapons
//   725  Prostitution and Pornography
//
// Iowa section header line format (verified pattern from legis.iowa.gov chapter PDFs):
//   "707.1 Person.\n"
//   "707.2 Murder in the first degree.\n"
//   "714.1 Theft defined.\n"
//   Section number: chapter.<digits>[A] form, e.g. "707.1", "709.4", "714.1A".
//   Period + space + title text on the SAME line.
//
// Bracket cites in body: "[C97, §690.1; C24, 27, 31, 35, 39, §12911; ..."
//   These appear at end of each section as the codification history; KEEP.
//
// No verified per-chapter fixtures yet — Wave 3 design task captures fixtures
// pre-ingest.

import { parseStatuteSections } from '../../lib/pdf-statute-harness.mjs';

export const IA_DOCS_BASE = 'https://www.legis.iowa.gov/docs/code';
export const IA_ALLOWED_HOSTS = ['www.legis.iowa.gov', 'legis.iowa.gov'];

export const IA_CRIMINAL_CHAPTERS = [
  '707', '708', '709', '710', '711', '712',
  '714', '716', '718', '719', '720', '723', '724', '725',
];

/**
 * Build the canonical IA chapter PDF URL.
 *   "707"  →  https://www.legis.iowa.gov/docs/code/707.pdf
 *
 * @param {string} chapter
 * @returns {string}
 */
export function buildChapterPdfUrl(chapter) {
  if (typeof chapter !== 'string' || !/^\d{3}[A-Za-z]?$/.test(chapter)) {
    throw new Error(`buildChapterPdfUrl: bad chapter: ${chapter}`);
  }
  return `${IA_DOCS_BASE}/${chapter}.pdf`;
}

/**
 * Build the authoritative source URL for a parsed IA section.
 *
 * Iowa exposes a per-section deep link via its statute lookup tool:
 *   https://www.legis.iowa.gov/docs/code/<chapter>/<sectionNum>.pdf
 * This deep link resolves to the chapter PDF anchored at the section. We
 * cite the chapter PDF as `source_urls[0]` (canonical bulk surface), since
 * the per-section deep link sometimes 404s when sub-decimals are used.
 *
 * @param {string} chapter   e.g. "707"
 * @param {string} sectionNum e.g. "707.1"
 * @returns {string}
 */
export function buildIaSourceUrl(chapter, _sectionNum) {
  return `${IA_DOCS_BASE}/${chapter}.pdf`;
}

// Section header regex.
// Group 1: full sectionNum, e.g. "707.1", "714.1A", "709.4".
// Group 2: title text on same line.
// Anchored at line start. Section number is `<chapter>.<section>` form;
// the period is BETWEEN chapter and section (NOT a trailing terminator).
// Header line shape (verified): "707.1 Person."  — sectionNum + space + title-with-period.
const IA_SECTION_RE =
  /^(\d{3}[A-Z]?\.\d+(?:[A-Z])?(?:\.\d+)?)\s+(.+)$/;

/** @type {import('../../lib/pdf-statute-harness.mjs').ParseConfig} */
export const IA_CONFIG = {
  state: 'IA',
  sectionRe: IA_SECTION_RE,
  // IA uses ASCII hyphen-minus throughout — no en-dash normalization needed.
  // Section IDs use period as the chapter/section separator.
  normalizeEnDash: true,
  minBodyChars: 20,
};

/**
 * Parse one IA chapter PDF text dump into Section[].
 *
 * @param {string} text  raw text from extractStatuteText()
 * @returns {Array<{ sectionNum: string, title: string, body: string }>}
 */
export function parseIaChapter(text) {
  return parseStatuteSections(text, IA_CONFIG);
}
