// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// Parser for Wyoming Title 6 (Crimes and Offenses) — single-PDF source.
//
// Source (verified 2026-05-02 via curl HEAD):
//   GET https://wyoleg.gov/statutes/compress/title06.pdf
//   → 200 OK, application/pdf, 415KB
//
// Strategy: download once, run pdf-parse to extract all-pages text, then
// segment by section anchors. Wyoming statute citation format is
// `6-1-101`, `6-1-102` etc — three numeric parts joined by hyphens.
//
// Section anchor detected at the start of a line where the text matches
// "<digit>-<digit+>-<digit+>." (the closing period is canonical). Body
// runs from the anchor up to (but not including) the next anchor or the
// end of the document. Repealed sections produce short bodies (5-15 chars
// like "Repealed.") — they are kept (they ARE law-state info).

import { PDFParse } from 'pdf-parse';

const SOURCE_URL = 'https://wyoleg.gov/statutes/compress/title06.pdf';

/**
 * Extract title-06 sections from PDF text.
 * Pure-string segmentation — no regex on file CONTENTS (rule); only on
 * line tokens already split by newline.
 *
 * @param {string} pdfText  output of pdf-parse `data.text`
 * @returns {Array<{ chapterNum: string, sectionNum: string, titleText: string, bodyText: string }>}
 */
export function parseWyTitle06Text(pdfText) {
  if (!pdfText || pdfText.length < 100) return [];

  // Split into lines; collapse multi-space.
  const lines = pdfText.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());

  // Find all anchors: lines starting with "6-N-NNN." (allow 3-4 digits in
  // article and section parts).
  /** @type {Array<{ idx: number, sectionNum: string, restOfLine: string }>} */
  const anchors = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    // Quick prefix gate: must start with "6-"
    if (!line.startsWith('6-')) continue;
    // Tokenize: split on first space → "6-N-NNN." | rest
    const sp = line.indexOf(' ');
    const head = sp < 0 ? line : line.slice(0, sp);
    // Validate head shape: 6-D+-D+ optionally trailing "." (canonical) or
    // ".NN" suffix for sub-sections (rare).
    if (!isValidWySectionHead(head)) continue;
    const sectionNum = head.replace(/\.$/, '');
    const restOfLine = sp < 0 ? '' : line.slice(sp + 1).trim();
    anchors.push({ idx: i, sectionNum, restOfLine });
  }

  /** @type {Array<{ chapterNum: string, sectionNum: string, titleText: string, bodyText: string }>} */
  const out = [];
  for (let a = 0; a < anchors.length; a++) {
    const { idx, sectionNum, restOfLine } = anchors[a];
    const nextIdx = a + 1 < anchors.length ? anchors[a + 1].idx : lines.length;
    const block = lines.slice(idx + 1, nextIdx).filter(Boolean);
    const titleText = (restOfLine || `Section ${sectionNum}`).slice(0, 300);
    const bodyText = (restOfLine ? restOfLine + ' ' : '') + block.join(' ');
    const cleanBody = bodyText.replace(/\s+/g, ' ').trim();
    if (cleanBody.length < 5) continue; // truly empty
    // chapter = middle component of section "6-N-NNN" → "N"
    const parts = sectionNum.split('-');
    const chapterNum = parts.length >= 2 ? parts[1] : '';
    out.push({ chapterNum, sectionNum, titleText, bodyText: cleanBody });
  }
  return out;
}

function isValidWySectionHead(head) {
  // Expected: "6-N-NNN" or "6-N-NNN." optionally with sub-section ".M"
  // ASCII-only digit/hyphen/period validation, no regex on FILE contents
  // (only on a tiny token).
  if (!head || head.length < 5) return false;
  if (!head.startsWith('6-')) return false;
  // Strip trailing period
  let h = head.endsWith('.') ? head.slice(0, -1) : head;
  // Now must be N-N-N (digits and hyphens, optionally a final .digits)
  // Walk character classes manually.
  let segs = h.split('-');
  if (segs.length < 3) return false;
  if (segs[0] !== '6') return false;
  for (let s = 1; s < segs.length; s++) {
    const seg = segs[s];
    if (!seg) return false;
    // Allow digits + optional .digits (e.g., "101.1")
    let dotCount = 0;
    for (let c = 0; c < seg.length; c++) {
      const ch = seg.charCodeAt(c);
      if (ch >= 48 && ch <= 57) continue;
      if (seg[c] === '.' && dotCount === 0) { dotCount++; continue; }
      return false;
    }
  }
  return true;
}

/**
 * Authoritative state URL for a WY Title 6 section.
 * The wyoleg.gov statute browser uses a query-string lookup;
 * canonical citation format is "Wyo. Stat. Ann. § 6-N-NNN".
 *
 * @param {string} sectionNum e.g. "6-1-101"
 * @returns {string}
 */
export function buildWySourceUrl(sectionNum) {
  const safe = String(sectionNum).trim().replace(/[^\w.\-]/g, '');
  // wyoleg.gov uses /NXT/gateway.dll?... for live HTML lookup, but the
  // single-PDF download is the canonical bulk source. Cite the PDF +
  // a section anchor — section browser at wyoleg.gov isn't deeplinkable.
  return `https://wyoleg.gov/statutes/compress/title06.pdf#section-${safe}`;
}

export { SOURCE_URL as WY_TITLE06_PDF_URL };

/**
 * Convenience: fetch + parse in one call.
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function fetchAndParseWyTitle06({ fetchImpl } = {}) {
  const f = fetchImpl || fetch;
  const res = await f(SOURCE_URL, {
    headers: { 'User-Agent': 'INAA-legal-research/1.0 (+https://imnotanattorney.com/about)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${SOURCE_URL}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // pdf-parse v2 ESM API:
  //   const parser = new PDFParse({ data: buf });
  //   const result = await parser.getText();  // { text, pages, ... }
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  const text = result?.text
    || (Array.isArray(result?.pages) ? result.pages.map((p) => p.text || '').join('\n') : '');
  return parseWyTitle06Text(text);
}
