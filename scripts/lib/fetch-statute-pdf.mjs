/**
 * scripts/lib/fetch-statute-pdf.mjs
 *
 * Shared statute-PDF fetch + section-split harness for Phase 4 ingest.
 * Supports MD (Maryland Criminal Law GCR), OK (Oklahoma Title 21),
 * and PA (Pennsylvania Title 18).
 *
 * Exports:
 *   PDF_BROWSER_HEADERS     — headers that pass as a real browser request
 *   fetchStatutePdf(url)    — fetch PDF buffer with retry + timeout
 *   extractPdfText(buffer)  — extract raw text string from PDF buffer
 *   splitSections(text, config) — split extracted text into section rows
 *
 * Per-state configs exported for convenience:
 *   MD_CONFIG, OK_CONFIG, PA_CONFIG
 */

import { PDFParse } from 'pdf-parse';

// ---------------------------------------------------------------------------
// Browser-spoof headers (some statute PDFs block headless fetches)
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
// fetchStatutePdf — fetch a PDF URL and return a Buffer
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FetchOptions
 * @property {number} [maxRetries=3] — number of retry attempts on transient failure
 * @property {number} [timeoutMs=60000] — per-attempt timeout in ms
 */

/**
 * Fetch a statute PDF from a URL, returning a Node.js Buffer.
 * Retries up to maxRetries times on network errors or 5xx responses.
 * Throws on non-200 responses after exhausting retries.
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
// extractPdfText — extract raw text from a PDF buffer
// ---------------------------------------------------------------------------

/**
 * Extract all text from a PDF buffer using pdf-parse v2 (PDFParse class).
 * Returns the concatenated text string across all pages.
 *
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
export async function extractPdfText(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

// ---------------------------------------------------------------------------
// splitSections — split extracted PDF text into section objects
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} StatuteSection
 * @property {string} sectionNum   — e.g. "2-201" / "21-701.7" / "2502"
 * @property {string} title        — section heading (empty string for MD-style headings)
 * @property {string} body         — full body text of the section
 */

/**
 * @typedef {Object} SplitConfig
 * @property {RegExp} sectionRe    — regex matching start of a section header line.
 *                                   Must capture sectionNum as group 1 and optional title as group 2.
 * @property {string} [state]      — short state code for debug context
 * @property {boolean} [normalizeEnDash=false] — replace U+2013 en-dashes with hyphens before parsing
 * @property {number} [minBodyChars=20] — skip sections whose body is shorter than this
 */

/**
 * Split statute PDF text into an array of section objects.
 * Works on the raw text output of extractPdfText.
 *
 * Algorithm:
 *   1. (Optionally) normalize en-dashes to hyphens.
 *   2. Walk line-by-line looking for lines that match sectionRe.
 *   3. For each matching header, collect subsequent lines as body until the
 *      next matching header (or end of text).
 *   4. Strip page-break artifacts (lines like "-- 4 of 653 --" and "- N -").
 *   5. Skip sections whose body is shorter than minBodyChars (e.g. TOC entries).
 *
 * @param {string} text
 * @param {SplitConfig} config
 * @returns {StatuteSection[]}
 */
export function splitSections(text, config) {
  const {
    sectionRe,
    normalizeEnDash = false,
    minBodyChars = 20,
  } = config;

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

  const PAGE_BREAK_RE = /^--\s*\d+\s+of\s+\d+\s*--|^-\s*\d+\s*-\s*$/;

  for (let hi = 0; hi < headers.length; hi++) {
    const hdr = headers[hi];
    const nextStart = hi + 1 < headers.length ? headers[hi + 1].startLine : lines.length;

    const bodyLines = lines
      .slice(hdr.startLine + 1, nextStart)
      .filter((l) => !PAGE_BREAK_RE.test(l.trim()));

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

// ---------------------------------------------------------------------------
// Per-state configs
// ---------------------------------------------------------------------------

/**
 * Maryland Criminal Law (GCR).
 *
 * Section headers appear as: §2-201.\n  or  §1–101.\n
 * No title on the header line — the first line of body is body text.
 * En-dashes (U+2013) used in section numbers must be normalized to hyphens.
 *
 * sectionRe group 1 = sectionNum (e.g. "2-201")
 * sectionRe group 2 = title (always empty for MD)
 */
export const MD_CONFIG = {
  state: 'MD',
  sectionRe: /^§(\d+[-–]\d+(?:\.\d+)?)\.\s*(.*)$/,
  normalizeEnDash: true,
  minBodyChars: 20,
};

/**
 * Oklahoma Title 21 Crimes and Punishments.
 *
 * Section headers appear as: §21-701.7. Murder in the first degree.
 * The full section number includes the title prefix (e.g. "21-701.7").
 * Title follows the section number on the same header line.
 *
 * sectionRe group 1 = sectionNum (e.g. "21-701.7")
 * sectionRe group 2 = title (e.g. "Murder in the first degree.")
 */
export const OK_CONFIG = {
  state: 'OK',
  sectionRe: /^§(\d+[-–]\d+(?:\.\d+)*(?:v\d+)?(?:-\d+)?)\.\s+(.+)$/,
  normalizeEnDash: false,
  minBodyChars: 20,
};

/**
 * Pennsylvania Title 18 Crimes and Offenses.
 *
 * Section headers appear as: § 2502. Murder.
 * Note the space between § and the section number.
 * Title follows the period after the section number.
 *
 * sectionRe group 1 = sectionNum (e.g. "2502")
 * sectionRe group 2 = title (e.g. "Murder.")
 */
export const PA_CONFIG = {
  state: 'PA',
  sectionRe: /^§\s+(\d{3,4}(?:\.\d+)?)\.\s+(.+)$/,
  normalizeEnDash: false,
  minBodyChars: 20,
};
