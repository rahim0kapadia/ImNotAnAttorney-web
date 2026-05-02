// HTML parsing helpers for revisor.mn.gov Minnesota Statutes Chapter 609
// (Criminal Code).
//
// Live structure verified 2026-05-02 against:
//   https://www.revisor.mn.gov/statutes/cite/609     (chapter TOC)
//   https://www.revisor.mn.gov/statutes/cite/609.02  (active section)
//   https://www.revisor.mn.gov/statutes/cite/609.155 (whole-section repealed; class="sr")
//   https://www.revisor.mn.gov/statutes/cite/609.21  (per-subd renumbered shell; class="sr_by_subd")
//
// Robots: revisor.mn.gov has no Crawl-delay (verified 2026-05-02).
// Authoritative source URLs use revisor.mn.gov directly — this is the official
// publisher (Office of the Revisor of Statutes for the State of Minnesota).
//
// Pure in-memory string processing — no file I/O in this module. Mirrors
// fl-html.mjs / oh-html.mjs / ma-html.mjs. No regex on file contents (regex
// runs only on already-loaded HTML strings, not files).

const MN_BASE_URL = 'https://www.revisor.mn.gov';
export const MN_BASE = MN_BASE_URL;

// ── Decode entities ─────────────────────────────────────────────────────────
export function decodeEntities(s) {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x27;/gi, "'")
    .replace(/&sect;|&#xa7;|&#167;/gi, '§')
    .replace(/&#8211;|&#x2013;/gi, '-')
    .replace(/&#8212;|&#x2014;/gi, '-')
    .replace(/&#8216;|&#8217;|&#x2018;|&#x2019;/gi, "'")
    .replace(/&#8220;|&#8221;|&#x201C;|&#x201D;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      if (!Number.isInteger(code) || code < 0 || code > 0x10FFFF) return '';
      if (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) return '';
      if (code === 0x7F) return '';
      if (code >= 0xD800 && code <= 0xDFFF) return '';
      return String.fromCodePoint(code);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = Number.parseInt(n, 16);
      if (!Number.isInteger(code) || code < 0 || code > 0x10FFFF) return '';
      if (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) return '';
      if (code === 0x7F) return '';
      if (code >= 0xD800 && code <= 0xDFFF) return '';
      return String.fromCodePoint(code);
    });
}

// ── Strip tags ─────────────────────────────────────────────────────────────
export function stripHtml(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n\n');
  s = s.replace(/<\/h2>/gi, ' ');
  s = s.replace(/<\/div>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  // Drop control chars except \t \n \r
  s = s.split('').filter((ch) => {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13) return true;
    if (c < 32) return false;
    if (c === 127) return false;
    return true;
  }).join('');
  return s.split(/\s+/).filter(Boolean).join(' ').trim();
}

// ── URL builders ───────────────────────────────────────────────────────────

/**
 * Build chapter TOC URL.
 * @param {string|number} chapter e.g. 609
 * @returns {string}
 */
export function buildChapterUrl(chapter) {
  return `${MN_BASE_URL}/statutes/cite/${chapter}`;
}

/**
 * Build the authoritative section URL for a Minnesota statute section number.
 * MN sections use dot syntax (e.g. "609.02", "609.2112").
 * @param {string} sectionNum e.g. "609.02"
 * @returns {string}
 */
export function buildMNSourceUrl(sectionNum) {
  return `${MN_BASE_URL}/statutes/cite/${sectionNum}`;
}

// ── TOC discovery ──────────────────────────────────────────────────────────

// Match chapter-section table-of-contents <tr> rows, capturing the ENTIRE row
// content so we can detect the surrounding <td class="inactive"> marker that
// flags renumbered/repealed entries. We deliberately do NOT use a global
// section-href regex — we want to filter inactive rows at discovery time so
// the harness never spends a polite-delay sleep fetching a body that resolves
// to a single "[Repealed, ...]" line.
const RX_MN_TOC_ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const RX_MN_TOC_SECTION_ANCHOR = /<a\s+[^>]*href=["']\/statutes\/cite\/(\d+\.[0-9A-Za-z]+)["'][^>]*>/i;
const RX_MN_TOC_INACTIVE_CELL = /<td[^>]*\bclass=["'][^"']*\binactive\b[^"']*["']/i;

/**
 * Discover MN section URLs for a given chapter, filtering out inactive
 * (renumbered or whole-section repealed) entries marked with
 * <td class="inactive"> in the TOC.
 *
 * Group headers — `<tr class="fgh"><th colspan="2">HOMICIDE</th></tr>` — are
 * skipped naturally because they contain no anchor matching the section
 * pattern.
 *
 * @param {string} html  TOC HTML
 * @param {string|number} chapter  e.g. 609 — used as a sanity prefix
 * @returns {string[]}  absolute URLs (https://www.revisor.mn.gov/statutes/cite/609.NN)
 */
export function discoverSectionUrls(html, chapter) {
  if (!html) return [];
  const chap = String(chapter);
  const seen = new Set();
  const out = [];

  RX_MN_TOC_ROW.lastIndex = 0;
  let m;
  while ((m = RX_MN_TOC_ROW.exec(html)) !== null) {
    const rowHtml = m[1];
    if (!rowHtml) continue;
    const am = rowHtml.match(RX_MN_TOC_SECTION_ANCHOR);
    if (!am) continue;
    const sectionNum = am[1];
    if (!sectionNum.startsWith(`${chap}.`)) continue;
    if (RX_MN_TOC_INACTIVE_CELL.test(rowHtml)) continue;
    const url = `${MN_BASE_URL}/statutes/cite/${sectionNum}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Extract the section number from a section URL.
 *   /statutes/cite/609.02     → "609.02"
 *   /statutes/cite/609.2112   → "609.2112"
 *
 * @param {string} sectionUrl
 * @returns {string}
 */
export function sectionIdFromUrl(sectionUrl) {
  const m = sectionUrl.match(/\/statutes\/cite\/(\d+\.[0-9A-Za-z]+)/);
  if (!m) throw new Error(`sectionIdFromUrl: cannot parse ${sectionUrl}`);
  return m[1];
}

// ── Section page parser ────────────────────────────────────────────────────

// Active section: <div class="section" id="stat.609.02"> ... <h1 class="shn">609.02 DEFINITIONS.</h1>
//   - heading prefix is "609.NN" then space, then headnote, ending with "."
const RX_MN_HEADING_SHN = /<h1[^>]*class=["'][^"']*\bshn\b[^"']*["'][^>]*>\s*(\d+\.[0-9A-Za-z]+)\s+([\s\S]*?)<\/h1>/i;

// Body container — `<div class="section"` (active) or `<div class="sr_by_subd"` (per-subd
// renumbered shells). Stop at next-sibling history block or end of statute container.
const RX_MN_BODY_SECTION = /<div\s+class=["']section["'][^>]*>([\s\S]*?)<div\s+class=["']history["']/i;
const RX_MN_BODY_SR_BY_SUBD = /<div\s+class=["']sr_by_subd["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i;

// Whole-section repealed shell: <div class="sr" id="stat.609.155"><b>609.155</b> [Repealed, ...]</div>
const RX_MN_SR = /<div\s+class=["']sr["'][^>]*>\s*<b>\s*\d+\.[0-9A-Za-z]+\s*<\/b>\s*([\s\S]*?)<\/div>/i;

/**
 * Parse a revisor.mn.gov section page.
 *
 * Returns {titleText, bodyText, effectiveDate} for active sections;
 * null for whole-section repealed shells (caught at discovery via TOC
 * inactive filter, but defensive null here too).
 *
 * Three structural variants observed 2026-05-02:
 *   1. Active section:    <div class="section">  + <h1 class="shn">N HEADNOTE.</h1>
 *      → return real headnote + body text
 *   2. Whole-section repealed: <div class="sr">  + <b>N</b> [Repealed, ...]
 *      → return null (TOC filter should already have dropped these)
 *   3. Per-subd renumbered shell: <div class="sr_by_subd"> + <h1>N </h1> (empty headnote)
 *      → return null (no headnote; entire body is renumbered/repealed pointers)
 *
 * @param {string} html
 * @param {string} sectionNum  e.g. "609.02" — used as fallback heading
 * @returns {{titleText: string, bodyText: string, effectiveDate: null}|null}
 */
export function parseSection(html, sectionNum) {
  if (!html || html.length < 1000) return null;

  // Variant 3: whole-section repealed shell — defensive skip
  const srMatch = html.match(RX_MN_SR);
  if (srMatch) return null;

  // Variant 1: active section — pull heading + body
  const headingMatch = html.match(RX_MN_HEADING_SHN);
  let titleText = '';
  if (headingMatch) {
    const headingNumber = headingMatch[1];
    if (headingNumber !== sectionNum) {
      // Heading section number doesn't match descriptor — treat as parse error
      // (safer than silently writing the wrong section).
      return null;
    }
    titleText = stripHtml(headingMatch[2]).trim();
    // Strip trailing period (MN formats headnotes with terminal period).
    titleText = titleText.replace(/\.$/, '').trim();
  }

  // Body extraction — try class="section" first, then class="sr_by_subd".
  let bodyChunk = null;
  const bm1 = html.match(RX_MN_BODY_SECTION);
  if (bm1) {
    bodyChunk = bm1[1];
  } else {
    const bm2 = html.match(RX_MN_BODY_SR_BY_SUBD);
    if (bm2) {
      // Variant 2 — but only return content if there's a real headnote.
      // sr_by_subd shells typically have empty headnotes (just "609.21 ").
      if (!titleText) return null;
      bodyChunk = bm2[1];
    }
  }
  if (!bodyChunk) return null;

  const bodyText = stripHtml(bodyChunk);

  // Sanity: body must be substantial. Real MN sections are >80 chars even for
  // the shortest definitions; <30 likely means parse drift.
  if (!bodyText || bodyText.length < 30) return null;

  // If we somehow got body without a headnote, fall back to a synthetic one
  // (matches MA/FL pattern for graceful degradation).
  if (!titleText) titleText = `Section ${sectionNum}`;

  return { titleText, bodyText, effectiveDate: null };
}
