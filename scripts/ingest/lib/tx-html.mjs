// HTML parsing helpers for Texas Penal Code chapter pages.
// Template: apps/web/scripts/ingest/lib/oh-html.mjs
// Pattern: cl-bulk-data-defensive #18 — single-file-per-chapter, all sections inline
// Source: https://tcss.legis.texas.gov/resources/PE/htm/PE.<chapter>.htm
//
// TX PE HTML structure (one file per chapter, all sections inline):
//   <a name="1.01"></a><a name="61953.53300"></a>
//   <p style="text-indent:7ex;" class="left">
//     <a target="_blank" href="https://statutes.capitol.texas.gov/Docs/PE/htm/PE.1.htm#1.01"
//        style="color:inherit;font-weight:bold;">Sec. 1.01.  SHORT TITLE.</a>
//     body text here
//   </p>
//   <p class="left">Acts 1973, 63rd Leg., ...  (legislative history — skip)</p>
//
// Authoritative source URL per section:
//   https://statutes.capitol.texas.gov/Docs/PE/htm/PE.<chapter>.htm#<section>
//   (extracted from the href inside the section link)

/**
 * @typedef {Object} TxSection
 * @property {string} chapterNum  e.g. "1", "22", "49"
 * @property {string} sectionNum  e.g. "1.01", "22.011", "49.04"
 * @property {string} titleText   heading text, e.g. "SHORT TITLE."
 * @property {string} bodyText    body text, stripped of HTML, ≤8000 chars
 * @property {string} sourceUrl   canonical URL with section anchor
 */

/** Detect SPA shell or empty/unusable chapter response. */
export function isChapterNotFound(html) {
  if (!html) return true;
  if (html.length < 500) return true;
  // SPA shell is ~250881 bytes and never contains real Sec. markers
  if (html.indexOf('Sec. ') < 0 && html.indexOf('<a name="') < 0) return true;
  // SPA shell contains Next.js bootstrap markers
  if (html.indexOf('__NEXT_DATA__') >= 0) return true;
  if (html.indexOf('/_next/static') >= 0) return true;
  return false;
}

/** Strip HTML tags, decode entities, drop control chars, collapse whitespace.
 *  Mirrors oh-html.mjs SEC-W3/W4 semantics (tags-first/decode-second/second-pass-strip). */
export function stripHtml(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n\n');
  s = s.replace(/<\/div>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
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
  // Second-pass: strip any tags that snuck through entity-decoded content
  s = s.replace(/<[^>]+>/g, ' ');
  // Drop C0 control chars (except HT/LF/CR) and DEL
  s = s.split('').filter((ch) => {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13) return true;
    if (c < 32) return false;
    if (c === 127) return false;
    return true;
  }).join('');
  return s.split(/\s+/).filter(Boolean).join(' ').trim();
}

/** True if a paragraph is a legislative history / amendment line.
 *  These add no semantic value to the statute body. */
function isHistoryLine(text) {
  const t = text.trim();
  // "Acts 1973, 63rd Leg., ...", "Added by Acts 2007, ...", "Amended by Acts ...",
  // "Reenacted by ...", "Transferred by ...", "Redesignated by ..."
  if (/^(?:Acts|Added by Acts|Amended by Acts|Reenacted by|Transferred by|Redesignated by)\s/.test(t)) return true;
  // "Amended by: " (bare label for following lines)
  if (/^Amended by:\s*$/.test(t)) return true;
  return false;
}

/**
 * Parse a TX PE chapter HTML file and extract all sections.
 *
 * Strategy:
 *   1. Find all `<a name="X.YY">` anchors whose chapter prefix matches.
 *   2. For each, find the section link to get the title text and source URL.
 *   3. Body = text of subsequent <p> tags until the next section anchor,
 *      excluding legislative-history lines.
 *
 * @param {string} html   Full content of PE.<chapter>.htm
 * @param {string|number} chapterNum  e.g. "1" or 1
 * @returns {TxSection[]}
 */
export function parseChapter(html, chapterNum) {
  const chapter = String(chapterNum);
  if (isChapterNotFound(html)) return [];

  // Collect all section anchors <a name="N.NN"> that belong to this chapter.
  // TX section numbers: "1.01", "22.011", "49.04", "49.045", "1.07" etc.
  // Numeric-ID anchors like "61953.53300" have a 5-digit prefix — skip them.
  const ANCHOR_RE = /<a\s+name="(\d+\.[0-9A-Za-z]+)"\s*>/g;
  const anchors = [];
  let m;
  while ((m = ANCHOR_RE.exec(html)) !== null) {
    const sectionNum = m[1];
    const dotIdx = sectionNum.indexOf('.');
    const secChapter = sectionNum.slice(0, dotIdx);
    // Must match chapter prefix exactly, and chapter part must be short (≤3 digits)
    if (secChapter !== chapter) continue;
    if (secChapter.length > 3) continue;  // skip numeric-ID anchors like "61953"
    anchors.push({ index: m.index, sectionNum });
  }

  if (anchors.length === 0) return [];

  const sections = [];

  for (let i = 0; i < anchors.length; i++) {
    const { index, sectionNum } = anchors[i];
    const nextIndex = i + 1 < anchors.length ? anchors[i + 1].index : html.length;

    // Slice the HTML window for this section
    const window = html.slice(index, nextIndex);

    // --- Extract source URL and title from the section link ---
    // Pattern: <a ... href="https://statutes.capitol.texas.gov/Docs/PE/htm/PE.N.htm#N.NN" ...>Sec. N.NN.  TITLE.</a>
    const escapedSec = sectionNum.replace('.', '\\.');
    const linkRe = new RegExp(
      `href="(https://statutes\\.capitol\\.texas\\.gov/Docs/PE/htm/PE\\.\\d+\\.htm#${escapedSec})"[^>]*>` +
      `(Sec\\.\\s+${escapedSec}\\.\\s+[\\s\\S]*?)<\\/a>`,
      'i'
    );
    const linkMatch = linkRe.exec(window);

    if (!linkMatch) continue;

    const sourceUrl = linkMatch[1];
    const rawTitle = stripHtml(linkMatch[2]);
    const titleText = sanitiseTitle(rawTitle, sectionNum);
    if (!titleText || titleText.length < 2) continue;

    // --- Extract body text ---
    // Body = everything after the closing </a> of the section link.
    const linkEnd = window.indexOf('</a>', window.indexOf(linkMatch[0]));
    const afterLink = linkEnd >= 0 ? window.slice(linkEnd + 4) : '';
    const bodyText = extractBodyText(afterLink);
    // A section with no body (e.g. "Repealed" stubs) falls back to the title.
    const finalBody = bodyText || titleText;
    if (!finalBody || finalBody.length < 2) continue;

    sections.push({
      chapterNum: chapter,
      sectionNum,
      titleText,
      bodyText: finalBody,
      sourceUrl,
    });
  }

  return sections;
}

/**
 * Extract body text from the HTML fragment after the section link.
 * Excludes legislative history lines.
 */
function extractBodyText(fragment) {
  const paragraphs = [];
  const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pPattern.exec(fragment)) !== null) {
    const text = stripHtml(m[1]);
    if (!text) continue;
    if (isHistoryLine(text)) continue;
    paragraphs.push(text);
  }

  if (paragraphs.length === 0) {
    const fallback = stripHtml(fragment);
    if (fallback && !isHistoryLine(fallback)) return fallback.slice(0, 8000);
    return '';
  }

  return paragraphs.join(' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
}

/**
 * Strip the leading "Sec. N.NN.  " prefix from a title string.
 * e.g. "Sec. 1.01.  SHORT TITLE." → "SHORT TITLE."
 */
function sanitiseTitle(raw, sectionNum) {
  const prefix1 = `Sec. ${sectionNum}.  `;
  if (raw.startsWith(prefix1)) return raw.slice(prefix1.length).trim();
  const prefix2 = `Sec. ${sectionNum}. `;
  if (raw.startsWith(prefix2)) return raw.slice(prefix2.length).trim();
  const prefix3 = `Sec. ${sectionNum}.`;
  if (raw.startsWith(prefix3)) return raw.slice(prefix3.length).trim();
  const escapedSec = sectionNum.replace('.', '\\.');
  const secPrefixRe = new RegExp(`^Sec\\.\\s+${escapedSec}[.]\\s+`);
  const rm = secPrefixRe.exec(raw);
  if (rm) return raw.slice(rm[0].length).trim();
  return raw;
}

/**
 * Build the canonical source URL for a TX PE section.
 * @param {string|number} chapter e.g. "1" or 1
 * @param {string} sectionNum e.g. "1.01"
 * @returns {string}
 */
export function buildSectionUrl(chapter, sectionNum) {
  return `https://statutes.capitol.texas.gov/Docs/PE/htm/PE.${chapter}.htm#${sectionNum}`;
}

/**
 * Parse a TX REST API body response (JSON from GetStatuteBody endpoint).
 *
 * The REST API returns: { statuteBody: "<html>...</html>", hadText: boolean }
 *
 * @param {{ statuteBody: string, hadText: boolean }|null} json
 * @param {string} sectionNum  e.g. "49.04"
 * @returns {{ titleText: string, bodyText: string }|null}
 */
export function parseSectionResponse(json, sectionNum) {
  if (!json || !json.hadText) return null;
  const raw = json.statuteBody;
  if (!raw || typeof raw !== 'string' || raw.length < 50) return null;

  const bodyText = stripHtml(raw);
  if (!bodyText || bodyText.length < 20) return null;

  // Extract title from "Sec. N.NN.  TITLE TEXT." pattern
  const escapedSec = sectionNum.replace('.', '\\.');
  const titleRe = new RegExp(`Sec\\.\\s+${escapedSec}\\.\\s+([A-Z][A-Z\\s,\\-()'']+?)(?=\\s{2,}|\\.|$)`);
  const titleMatch = titleRe.exec(bodyText);
  let titleText = titleMatch ? titleMatch[1].trim() : null;

  // Fallback: grab the ALLCAPS segment after the section number prefix
  if (!titleText) {
    const fallbackRe = new RegExp(`Sec\\.\\s+${escapedSec}\\.\\s+([^.]+?\\.)`);
    const fm = fallbackRe.exec(bodyText);
    if (fm) titleText = fm[1].trim();
  }

  if (!titleText) titleText = `Section ${sectionNum}`;

  return {
    titleText,
    bodyText: bodyText.slice(0, 20000),
  };
}
