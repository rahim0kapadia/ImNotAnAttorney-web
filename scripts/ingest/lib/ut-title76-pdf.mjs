// Template: scripts/ingest/lib/de-title11-pdf.mjs (single full-title PDF parser pattern)
// Template: scripts/ingest/lib/ok-title21-pdf.mjs (multi-format section-num regex)
// Pattern: cl-bulk-data-defensive #19 — per-chapter PDFs as bulk source (no API loops)
// csv-bulk-checked: per-chapter — https://le.utah.gov/xcode/Title76/Chapter{N}/C76-{N}_{YYYYMMDD}{YYYYMMDD}.pdf
//   (verified live 2026-05-02: 11 of 13 active chapters return application/pdf,
//    sizes 5KB-195KB, born-digital text layer, official state code authored by
//    Utah Office of Legislative Research and General Counsel)
//
// Utah Title 76 — Utah Criminal Code.
//
// Source: per-chapter PDFs at le.utah.gov. Each chapter's HTML shell embeds a
// JS bootstrap with a `versionArr` array naming the current effective-date PDF
// stem. We harvest the stem from the static HTML (no Playwright required —
// versionArr is server-rendered, not React-hydrated), then HEAD-fetch the PDF.
//
// Format observations (verified against live Chapter 5 PDF, 2026-05-02):
//   Page header: "Utah Code\nPage N\nEffective M/D/YYYY\nChapter K\n<title>"
//                appears on every page; must be filtered.
//   Page break: "-- N of M --" lines.
//   Section header line: "76-5-101 Definitions."
//     - NO § symbol (unique among Wave 1C states)
//     - Format: "76-{chapter}-{section}[.{decimal}] {Title text}."
//     - Section number: "76-" + chapter slug + "-" + digits, optionally with
//       a decimal (e.g. "76-5-102.1") or a range marker ("76-5-1289.16-1")
//     - Single ASCII space between section-id and title text
//     - Title may wrap to a continuation line (no leading section-id on cont.)
//     - Title sometimes ends with "--" (en-dash continuation marker)
//   Body: free text below header until next section header.
//   Section close: "Amended by Chapter ...", "Enacted by Chapter ...",
//     "Repealed by Chapter ...", "Renumbered and Amended by Chapter ..."
//     — KEEP these; they are part of the canonical statute body.
//   Cross-references inside body: "76-5-418, 76-5-419, or 76-5-420; or"
//     — these have commas/semicolons after the section-id and MUST NOT match
//       the section-header regex. The regex requires the section-id be followed
//       by exactly one ASCII space then a non-comma, non-period char.
//
// Parser strategy: line-by-line scan. The PDF text layer preserves each
// printed line, so a header always starts at a line boundary. We handle title
// continuation by attaching the next line to the title when it (a) does not
// itself match the section regex, (b) is non-empty after trim, and (c) the
// previous header line ended with "--" (the official Utah continuation marker).

import { parseStatuteSections } from '../../lib/pdf-statute-harness.mjs';

// ---------------------------------------------------------------------------
// Hardcoded chapter list — verified live 2026-05-02 against le.utah.gov.
// ---------------------------------------------------------------------------
//
// Title 76 chapters that exist as of 2026-05-02:
//   1, 2, 3, 4, 5, 5a, 5b, 6, 6a, 7, 8, 9, 10
// Chapter 3a (probed) returns 404; not part of current Title 76. The original
// 2026-05-02 design report listed it speculatively. Drop unless le.utah.gov
// re-introduces it.
//
// Chapters 6a and 10 return 200 on the chapter shell but `versionArr` is
// empty — small stub PDFs (~5KB each) are still served via the sentinel
// effective-date pattern `C76-{ch}_1800010118000101.pdf`. We accept these
// stubs as legitimate bulk sources and include them in the cohort.

export const UT_TITLE76_CHAPTERS = [
  '1', '2', '3', '4', '5', '5a', '5b', '6', '6a', '7', '8', '9', '10',
];

// Sentinel effective-date that le.utah.gov uses for "no specific effective
// date" — corresponds to the chapter's static current text. A real
// effective-date stamp like 2022050420220504 means a specific session law
// changed that chapter.
const SENTINEL_VERSION_DATE = '1800010118000101';

// ---------------------------------------------------------------------------
// Section header regex
// ---------------------------------------------------------------------------
//
// Group 1: full section number — "76-{chapter}-{N}[.{N}][-{N}]"
//   - Chapter slug: digits + optional lowercase letter ("5", "5a", "5b")
//   - Section number: 1-4 digits with optional decimal extension(s) and
//     optional trailing range marker
//   - Examples: 76-1-101, 76-5-102, 76-5-102.1, 76-5-106.5, 76-5-1289.16-1
// Group 2: title text — everything after the single space, up to end of line
//
// Anchored at line start. CRITICAL: the lookahead after the section-id
// requires a single ASCII space followed by a non-comma, non-semicolon char,
// which excludes body-text cross-references like "76-5-418, 76-5-419 ...".
const UT_SECTION_RE =
  /^(76-\d{1,2}[a-z]?-\d{1,4}(?:\.\d{1,4})?(?:-\d{1,4})?)\s([^,;].*)$/;

// ---------------------------------------------------------------------------
// Page-break + page-header artifact filter
// ---------------------------------------------------------------------------
//
// Utah PDFs have a 4-line per-page header ("Utah Code\nPage N\nEffective ...
// \nChapter K\n<chapter-title>") AND a 1-line per-page footer ("-- N of M --").
// The default page-break regex in pdf-statute-harness.mjs handles "-- N of
// M --" already; we extend with a UT-specific regex to also drop the page
// header lines. parseStatuteSections accepts a single regex, so we OR them.
const UT_PAGE_BREAK_RE =
  /^(?:--\s*\d+\s+of\s+\d+\s*--|Utah\s+Code|Page\s+\d+|Effective\s+\d{1,2}\/\d{1,2}\/\d{4})\s*$/;

/** @type {import('../../lib/pdf-statute-harness.mjs').ParseConfig} */
export const UT_CONFIG = {
  state: 'UT',
  sectionRe: UT_SECTION_RE,
  // Utah uses ASCII hyphens; en-dash never observed in section numbers.
  normalizeEnDash: false,
  // 30 char floor — slightly above harness default of 20 to drop 1-line
  // chapter-stub PDFs (chapters 6a, 10) that contain only "Renumbered and
  // Amended by..." with no real body. This loses a small number of valid
  // stub-only sections in exchange for filtering ToC-style header echoes.
  minBodyChars: 30,
  pageBreakRe: UT_PAGE_BREAK_RE,
};

// ---------------------------------------------------------------------------
// Parser entry point
// ---------------------------------------------------------------------------

/**
 * Parse all sections from a single chapter's PDF text.
 *
 * @param {string} text  output of extractStatuteText() on a chapter PDF buffer
 * @returns {import('../../lib/pdf-statute-harness.mjs').StatuteSection[]}
 */
export function parseTitle76Chapter(text) {
  return parseStatuteSections(text, UT_CONFIG);
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

/**
 * Build the chapter-shell HTML URL — used to harvest the current versionArr
 * effective-date stem. NOT a statute body source.
 *
 * @param {string} chapter  e.g. "5", "5a"
 * @returns {string}
 */
export function buildUtChapterShellUrl(chapter) {
  return `https://le.utah.gov/xcode/Title76/Chapter${chapter}/76-${chapter}.html`;
}

/**
 * Build the chapter PDF URL given the version stem (without `.pdf`).
 *
 * @param {string} chapter  e.g. "5", "5a"
 * @param {string} versionStem  e.g. "C76-5_2022050420220504"
 * @returns {string}
 */
export function buildUtChapterPdfUrl(chapter, versionStem) {
  return `https://le.utah.gov/xcode/Title76/Chapter${chapter}/${versionStem}.pdf`;
}

/**
 * Build the sentinel-date PDF URL for chapters whose versionArr is empty.
 *
 * @param {string} chapter  e.g. "6a", "10"
 * @returns {string}
 */
export function buildUtSentinelPdfUrl(chapter) {
  return `https://le.utah.gov/xcode/Title76/Chapter${chapter}/C76-${chapter}_${SENTINEL_VERSION_DATE}.pdf`;
}

/**
 * Extract the current PDF version stem from the chapter shell HTML.
 *
 * The shell embeds:
 *   var versionArr = [ ['C76-5_2022050420220504.html','Current Version','C76-5_2022050420220504'] ];
 *
 * Returns the stem (without `.pdf` / `.html`), or null if the shell has an
 * empty versionArr — caller falls back to the sentinel URL.
 *
 * @param {string} html
 * @returns {string|null}
 */
export function extractVersionStemFromShell(html) {
  // Match the FIRST element of the FIRST inner array of versionArr.
  const m = html.match(/var\s+versionArr\s*=\s*\[\s*\[\s*'([^']+)\.html'/);
  if (!m) return null;
  return m[1];
}

/**
 * Build the authoritative state-leg URL for a given section number.
 *
 * The seeder calls this with the chapter and the full section number (e.g.
 * "76-5-102") and the per-chapter PDF URL it actually fetched. We point
 * every row at the per-chapter PDF (not the title-level shell) because that
 * is the actual bulk source of the row's text.
 *
 * @param {string} _sectionNum  full canonical section ("76-5-102")
 * @param {string} chapterPdfUrl  the PDF URL the seeder fetched for this chapter
 * @returns {string}
 */
export function buildUtSourceUrl(_sectionNum, chapterPdfUrl) {
  return chapterPdfUrl;
}
