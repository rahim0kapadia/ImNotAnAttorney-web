// Template: scripts/lib/fetch-statute-pdf.mjs (MD's PDF harness, branch feat/state-statutes-md-cr-v2)
// Pattern: cl-bulk-data-defensive #19 — single full-title PDF as bulk source (no API loops)
// csv-bulk-checked: per-state — DE, ME, OK ship single full-title PDFs (URLs in per-state libs)
//
// Shared statute-PDF fetch + section-split harness for Wave 1C ingest (DE/ME/OK).
//
// Lift-and-clean port of MD's fetch-statute-pdf.mjs. Identical contract, plus
// the row schema is documented to mirror unicourt-harness.mjs so seeders that
// build rows from this harness use the same entities_statutes column shape:
//
//   Section { sectionNum: string, title: string, body: string }
//
// Per-state seeders adapt this Section into the entities_statutes row shape
// (jurisdiction/title/section/subsection/section_text/source_urls/text_hash/
// is_current/effective_date/scraped_at) — same as the MD seeder.
//
// Exports:
//   PDF_BROWSER_HEADERS                 — headers that pass as a real browser
//   fetchStatutePdf(url, opts)          — fetch PDF buffer with retry + timeout
//   extractStatuteText(buffer)          — extract raw text string from PDF
//   parseStatuteSections(text, config)  — split extracted text into Section[]
//
// Per-state configs (each lives in scripts/ingest/lib/<state>-title<N>-pdf.mjs)
// pass: { sectionRe, normalizeEnDash?, minBodyChars?, pageBreakRe? }
//
// npm dep: pdf-parse@^2.4.5 (already in package.json — uses PDFParse class API)
//
// Why a separate file from fetch-statute-pdf.mjs:
// - This is the canonical shared harness for Wave 1C+. The older MD file at
//   scripts/lib/fetch-statute-pdf.mjs is preserved for the existing MD seeder
//   (feat/state-statutes-md-cr-v2 branch) so that PR doesn't conflict.
// - DE/ME/OK seeders should import from this file. MD's per-state config
//   moves into scripts/ingest/lib/md-cr-pdf.mjs in a follow-up if/when the
//   MD seeder is consolidated.

import { PDFParse } from 'pdf-parse';

// ---------------------------------------------------------------------------
// Browser-spoof headers — some statute PDFs (Maine, Oklahoma) block default
// node-fetch UAs.
// ---------------------------------------------------------------------------

export const PDF_BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/pdf,application/octet-stream,*/*;q=0.9',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Cache-Control': 'no-cache',
};

// ---------------------------------------------------------------------------
// fetchStatutePdf
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FetchOptions
 * @property {number} [maxRetries=3]   number of retry attempts on transient failure
 * @property {number} [timeoutMs=60000] per-attempt timeout in ms
 */

/**
 * Fetch a statute PDF from a URL, returning a Node.js Buffer.
 * Retries up to maxRetries times on network errors or non-2xx responses.
 * Throws the last error after exhausting retries.
 *
 * @param {string} url
 * @param {FetchOptions} [opts]
 * @returns {Promise<Buffer>}
 */
export async function fetchStatutePdf(url, opts = {}) {
  const { maxRetries = 3, timeoutMs = 60000 } = opts;

  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          headers: PDF_BROWSER_HEADERS,
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
        }
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// extractStatuteText
// ---------------------------------------------------------------------------

/**
 * Extract all text from a PDF buffer using pdf-parse v2 (PDFParse class).
 * Returns the concatenated text string across all pages.
 *
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
export async function extractStatuteText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

// ---------------------------------------------------------------------------
// parseStatuteSections
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} StatuteSection
 * @property {string} sectionNum  e.g. "101" (DE), "1-A" (ME), "21-701.7" (OK)
 * @property {string} title       section heading on the same line as sectionNum
 *                                (may be empty for state formats that put
 *                                title on next line)
 * @property {string} body        full body text from the line after the
 *                                header up to the next section header, with
 *                                page-break artifacts stripped
 */

/**
 * @typedef {Object} ParseConfig
 * @property {RegExp}  sectionRe          regex matched per line. Group 1 must
 *                                        be the sectionNum, group 2 may be
 *                                        the inline title (empty string if
 *                                        the format puts title elsewhere).
 * @property {string}  [state]            short state code for debug context
 * @property {boolean} [normalizeEnDash=false] replace U+2013 with '-' first
 * @property {number}  [minBodyChars=20]  skip sections whose body is shorter
 *                                        (drops TOC entries that match the
 *                                        section regex but have empty body)
 * @property {RegExp}  [pageBreakRe]      lines matching this are dropped from
 *                                        body. Defaults to '-- N of M --' and
 *                                        bare '- N -' page markers used by
 *                                        MD/DE/OK PDFs.
 */

const DEFAULT_PAGE_BREAK_RE = /^--\s*\d+\s+of\s+\d+\s*--|^-\s*\d+\s*-\s*$/;

/**
 * Split statute PDF text into an array of section objects.
 *
 * Algorithm:
 *   1. (Optional) normalize U+2013 en-dashes to ASCII hyphens.
 *   2. Walk line-by-line; collect lines matching sectionRe as headers.
 *   3. For each header, body = lines from header+1 up to the next header,
 *      with page-break artifact lines filtered.
 *   4. Drop sections whose body is shorter than minBodyChars (kills TOC
 *      entries that match sectionRe but have no body).
 *
 * Note: this returns sections in document order, including duplicates if
 * the PDF lists a section in TOC AND in body. Caller (seeder) deduplicates
 * on (jurisdiction, title, section, subsection) — the TOC instance has body
 * shorter than minBodyChars so it never reaches dedup; the body instance is
 * the one that survives.
 *
 * @param {string} text
 * @param {ParseConfig} config
 * @returns {StatuteSection[]}
 */
export function parseStatuteSections(text, config) {
  const {
    sectionRe,
    normalizeEnDash = false,
    minBodyChars = 20,
    pageBreakRe = DEFAULT_PAGE_BREAK_RE,
  } = config;

  if (!sectionRe) {
    throw new Error('parseStatuteSections: config.sectionRe is required');
  }

  const source = normalizeEnDash ? text.replace(/–/g, '-') : text;
  const lines = source.split('\n');

  /** @type {{ sectionNum: string; title: string; startLine: number }[]} */
  const headers = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(sectionRe);
    if (m) {
      headers.push({
        sectionNum: m[1].trim(),
        title: (m[2] || '').trim(),
        startLine: i,
      });
    }
  }

  /** @type {StatuteSection[]} */
  const sections = [];

  for (let hi = 0; hi < headers.length; hi++) {
    const hdr = headers[hi];
    const nextStart =
      hi + 1 < headers.length ? headers[hi + 1].startLine : lines.length;

    const bodyLines = lines
      .slice(hdr.startLine + 1, nextStart)
      .filter((l) => !pageBreakRe.test(l.trim()));

    const body = bodyLines.join('\n').trim();

    if (body.length < minBodyChars) continue;

    sections.push({
      sectionNum: hdr.sectionNum,
      title: hdr.title,
      body,
    });
  }

  return sections;
}
