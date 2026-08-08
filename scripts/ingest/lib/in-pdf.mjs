// Template: scripts/ingest/lib/de-title11-pdf.mjs (PDF-harness per-state parser)
// Pattern: cl-bulk-data-defensive #19 — single full-Title PDF as bulk source
// csv-bulk-checked: https://www.in.gov/ipac/files/Title-35-Indiana-Code-2022.pdf
//   (~12.4 MB / 881 pages, official state code, single full-Title-35 PDF,
//    born-digital text layer, public-domain via state authorship)
//
// Indiana Title 35 — Criminal Law and Procedure (Wave 3 hostile-states pivot
// from Justia mirror — Justia is Cloudflare-walled per J1-J7 ban incident
// 2026-05-01).
//
// Format observations (verified against live PDF, 2026-05-02):
//   Title page: "IC 35 TITLE 35. CRIMINAL LAW AND PROCEDURE" + Article TOC
//   Chapter TOC: "Art. N. NAME" lines, then per-chapter "IC 35-A-C-S Title"
//     style TOC entries. The first article in the body is preceded by a
//     full chapter TOC, which would over-match the section regex if titles
//     started with lowercase or parens. The tighter regex (group 2 must
//     start with [A-Z"] and not '(') drops most TOC false-positives.
//   Section header line:
//     IC 35-31.5-2-79.5 "Critical infrastructure facility"
//     IC 35-42-1-1 Murder
//     - Literal "IC " prefix (mandatory)
//     - Section ID: 4-part (Title-Article-Chapter-Section) with optional
//       decimal subsection on each part: e.g. "35-31.5-2-79.5", "35-42-1-1"
//     - Single ASCII space between section ID and title text
//     - Title text on the SAME line (or absent for a few headers)
//   Body: first line typically "Sec. N. ..." or "Repealed".
//   Page-break artifacts: "Indiana Code 2022\n\n-- N of 881 --" lines.
//   Citation footer per section: "As added by P.L.114-2012, SEC.67."
//     and amendment list. KEEP these — canonical statute provenance.
//
// Inline-citation false-positive: body text occasionally cites another
// section, e.g. "IC 35-31.5-2-321.5 (before its repeal on July 1, 2019)"
// — a paren-prefix in group 2 would be captured by a loose regex. The
// tightened regex `(?:\s+([A-Z\"][^(].*))?$` rejects parens-led titles
// and lowercase-led title text, dropping most inline-citation matches.
// Remaining duplicates (3 across the full title as of 2022) are handled
// by the seeder's dedup on (jurisdiction, title, section).
//
// Parser: thin wrapper that calls parseStatuteSections() with IN config and
// stamps a state-anchored source URL on every row.

import { parseStatuteSections } from '../../lib/pdf-statute-harness.mjs';

// Stable PDF URL — the only authoritative bulk source. The 2022 edition is
// the latest single-file Title 35 PDF in.gov/ipac publishes; 2023/2024/2025
// 404 (verified 2026-05-02). When IN posts a newer year the URL year suffix
// changes — bump the constant and re-run the seeder.
export const IN_TITLE35_PDF_URL =
  'https://www.in.gov/ipac/files/Title-35-Indiana-Code-2022.pdf';

// Section header regex.
//   Group 1: section ID — 4-part Title-Article-Chapter-Section, each part
//     1-4 digits with optional .NN decimal. Title is always literal "35".
//     Examples: "35-42-1-1", "35-31.5-2-79.5", "35-50-2-2.1".
//   Group 2: title text on the same line — must start with [A-Z"] and must
//     not start with '(' to filter out inline-citation false positives.
//
// Anchored at line start. The "IC " literal prefix is mandatory.
const IN_SECTION_RE =
  /^IC (35-\d+(?:\.\d+)?-\d+(?:\.\d+)?-\d+(?:\.\d+)?)(?:\s+([A-Z"][^(].*))?$/;

// Page-break and provenance artifacts in the IN PDF that should be stripped
// from body text. The base harness pageBreakRe doesn't match
// "Indiana Code 2022" (which appears as a header on every page) so we extend
// it here.
const IN_PAGE_BREAK_RE =
  /^--\s*\d+\s+of\s+\d+\s*--$|^-\s*\d+\s*-\s*$|^Indiana Code \d{4}\s*$/;

/** @type {import('../../lib/pdf-statute-harness.mjs').ParseConfig} */
export const IN_CONFIG = {
  state: 'IN',
  sectionRe: IN_SECTION_RE,
  // No en-dashes observed in IN section IDs.
  normalizeEnDash: false,
  minBodyChars: 20,
  pageBreakRe: IN_PAGE_BREAK_RE,
};

/**
 * Parse all sections from the IN Title 35 PDF text.
 * @param {string} text  output of extractStatuteText() on the Title 35 PDF
 * @returns {import('../../lib/pdf-statute-harness.mjs').StatuteSection[]}
 */
export function parseTitle35(text) {
  return parseStatuteSections(text, IN_CONFIG);
}

/**
 * Build the authoritative state-leg URL for a given section number.
 *
 * Indiana publishes Title 35 only as a single full-title PDF on in.gov/ipac.
 * iga.in.gov/laws/ has per-section deep-links but the URL grammar is
 * dynamic-form (year + section path), and that surface is JS-rendered +
 * UA-walled (verified 2026-05-01, MyIGA REST API requires x-api-key).
 *
 * Pointing every row at the title-level PDF is truthful and idempotent —
 * the source URL is a verification anchor, not a deep-link.
 *
 * @param {string} _sectionNum
 * @returns {string}
 */
export function buildInSourceUrl(_sectionNum) {
  return IN_TITLE35_PDF_URL;
}
