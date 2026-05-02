// Template: scripts/ingest/lib/de-title11-pdf.mjs (per-state PDF parser pattern)
// Pattern: cl-bulk-data-defensive #19 — single full-Chapter PDF as bulk source
// csv-bulk-checked: https://legislature.mi.gov/documents/mcl/pdf/mcl-chap750.pdf
//   (~2.06 MB, 459 pages, official Michigan Penal Code, born-digital text layer,
//   complete through PA 9 of 2026, actively maintained.)
//
// Michigan Compiled Laws — Chapter 750 — Penal Code.
//
// Format observations (verified against live PDF, 2026-05-02):
//   Title page: "Chapter 750 / MICHIGAN PENAL CODE / THE MICHIGAN PENAL CODE /
//     Act 328 of 1931" + multi-paragraph statement of purpose.
//
//   Section header line:  "750.1 Michigan penal code; short title."
//                         "750.10a Sexually delinquent persons; definition."
//     - MCL prefix `750.` is implicit on every section in this chapter.
//     - Section number: 1-3 digits with optional single lowercase letter suffix
//       (e.g. "1", "10a", "316b"). NO decimal-subsection (`.M`) and NO
//       alpha+digit (`a1`) observed in 903 raw header matches across the PDF.
//     - Single ASCII space between section number and title text on same line.
//     - Title may wrap onto the next line (caller treats the wrap as part of
//       body — acceptable noise that preserves information).
//     - Every section also has a "Sec. N" line a few lines down inside the body
//       (NOT on the header line; we don't double-match it).
//
//   Body: free text below header until next section header.
//     - Includes "History:", "Compiler's Notes:", "Constitutionality:",
//       "Former Law:" sub-blocks. KEEP these; they are part of the canonical
//       statute as published.
//
//   Page-break artifacts to strip:
//     - "-- N of 459 --" markers (handled by harness DEFAULT_PAGE_BREAK_RE).
//     - Per-page header/footer pair the MI PDF emits between every page:
//         "Rendered <Day>, <Month> <Day>, <Year> \tPage N of 459 \tMichigan
//          Compiled Laws Complete Through PA 9 of 2026"
//         "Courtesy of legislature.mi.gov"
//       These would otherwise leak into body and pollute every section.
//
//   Range-repealed lines like "750.19-750.24 Repealed. ..." or
//     "750.11, 750.12 Repealed. ..." are intentionally NOT matched by the
//     section regex (the comma/dash breaks the strict header shape). 18 such
//     lines exist; their content is purely historical and redundant with the
//     individual repealed-section entries that the parser DOES match.
//
//   Individually-repealed sections (e.g. "750.14 Repealed. 2023, Act 11, Eff.
//     Feb. 13, 2024") DO match the regex; the seeder filters them at row-build
//     time by detecting `title.startsWith('Repealed.')` or `'Transferred.'`.
//     This keeps the parser format-agnostic and re-usable.

import { parseStatuteSections } from '../../lib/pdf-statute-harness.mjs';

// Stable PDF URL — the only authoritative bulk source.
export const MI_CHAPTER750_PDF_URL =
  'https://legislature.mi.gov/documents/mcl/pdf/mcl-chap750.pdf';

// Section header regex.
//   Group 1: section number — `<digits>` or `<digits><single-lowercase-letter>`
//     e.g. "1", "10a", "33a", "316b"
//   Group 2: title text — everything after the single space on the header line
//
// Anchored at line start. The MCL `750.` prefix is required and is part of the
// match (but not part of the captured section number — we store just the
// section portion to match the canonical "Sec. N" reference style attorneys
// use). Trailing period in title is preserved by group 2.
//
// IMPORTANT — `(?!;--)` negative lookahead: the MI PDF wraps multi-amendment
// History citation lines such that wrapped continuations like
//   "750.25 ;-- Am. 2002, Act 672, Eff. Mar. 31, 2003"
// land at line start with the same shape as a real header. Without the
// negative lookahead, those wrapped continuations matched as phantom-§-25
// duplicate sections (parser-bug confirmed against 22 dups in 900 raw matches
// during 2026-05-02 live ingest probe). The lookahead drops 31 such false
// positives without losing any real section, including curly-quoted titles
// like `750.5 "Crime" defined.` which a naive `^[A-Za-z]` tightening would
// have wrongly excluded (verified against 9 curly-quote sections in the PDF).
const MI_SECTION_RE = /^750\.(\d{1,4}[a-z]?)\s+(?!;--)(.+)$/;

// Strip MI's per-page header/footer in addition to the harness default.
const MI_PAGE_BREAK_RE =
  /^--\s*\d+\s+of\s+\d+\s*--$|^-\s*\d+\s*-\s*$|^Rendered\s+\S+,\s+.+Page\s+\d+\s+of\s+\d+.+Michigan Compiled Laws.*$|^Courtesy of legislature\.mi\.gov\s*$/;

/** @type {import('../../lib/pdf-statute-harness.mjs').ParseConfig} */
export const MI_CONFIG = {
  state: 'MI',
  sectionRe: MI_SECTION_RE,
  // No en-dashes observed in MI section numbers.
  normalizeEnDash: false,
  // 20-char floor drops nothing meaningful for MI (every real section has a
  // History: line at minimum). Even individually-repealed sections have ~80
  // chars of compiler notes — they pass the floor but are filtered later by
  // the seeder via the title prefix.
  minBodyChars: 20,
  pageBreakRe: MI_PAGE_BREAK_RE,
};

/**
 * Parse all sections from the MI Chapter 750 PDF text.
 * @param {string} text  output of extractStatuteText() on the mcl-chap750.pdf
 *                       buffer
 * @returns {import('../../lib/pdf-statute-harness.mjs').StatuteSection[]}
 */
export function parseChapter750(text) {
  return parseStatuteSections(text, MI_CONFIG);
}

/**
 * Build the authoritative state-leg URL for a given section number.
 *
 * The Michigan single-PDF source has no per-section anchor inside it. The
 * legislature.mi.gov SPA provides per-section deep-links of the form
 *   https://legislature.mi.gov/Laws/MCL?objectName=mcl-750-<section>
 * but those resolve client-side via JavaScript, so they are unreliable as
 * verification anchors for downstream consumers (curl + cheerio see an empty
 * shell). Pointing every row at the authoritative chapter-level PDF is
 * truthful and idempotent; the source_url is a verification anchor, not a
 * deep-link.
 *
 * @param {string} _sectionNum
 * @returns {string}
 */
export function buildMiSourceUrl(_sectionNum) {
  return MI_CHAPTER750_PDF_URL;
}

/**
 * Helper — does the section header title indicate a repealed/transferred
 * statute? The seeder uses this to skip historical entries from row build.
 *
 * Why filter at the seeder, not the parser: parseStatuteSections is shared
 * across DE/ME/OK/MI and stays format-agnostic. The repealed-detection rule
 * is MI-specific (DE/OK do not emit individual-repealed sections in the same
 * shape).
 *
 * @param {string} title  the parsed section title (group 2 of MI_SECTION_RE)
 * @returns {boolean}
 */
export function isRepealedTitle(title) {
  if (!title) return false;
  return /^(Repealed|Transferred)\b/i.test(title.trim());
}
