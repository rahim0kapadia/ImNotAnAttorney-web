// Template: apps/web/scripts/ingest/lib/va-html.mjs
// Pattern: cl-bulk-data-defensive #18 — GA Title 16 is single-file HTML, parse in-memory
// Source: unicourt.github.io/cic-code-ga/transforms/ga/ocga/r70/gov.ga.ocga.title.16.html
//
// GA HTML structure (OCGA Title 16, UniCourt Release 70):
//   <h2 class="oneh2" id="t16c01">       ← chapter boundary
//   <h3 id="t16c01s16-1-1">              ← section heading
//     <b>16-1-1. Short title.</b>
//   </h3>
//   <p>Body text…</p>                    ← body (first <p> after h3, before next boundary)
//   <div>…judicial decisions…</div>      ← skip these trailing divs
//
// Authoritative source URL: https://law.justia.com/codes/georgia/section/{section-num}/
// (Justia robots.txt: no Crawl-delay, no /codes/ disallow — confirmed 2026-05-01)

/**
 * @typedef {Object} GaSection
 * @property {string} chapterNum  e.g. "1", "3", "16"
 * @property {string} sectionNum  e.g. "16-1-1", "16-3-21"
 * @property {string} titleText   heading text, stripped of HTML
 * @property {string} bodyText    body text, stripped of HTML
 */

/** Strip all HTML tags and normalise whitespace */
export function stripHtml(raw) {
  return raw
    // Remove script/style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Remove all tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities manually (no external dep needed)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#xa7;|&#167;/gi, '§')
    .replace(/&sect;/gi, '§')
    // Collapse whitespace
    .replace(/[\s ]+/g, ' ')
    .trim();
}

/**
 * Parse the GA Title 16 single-file HTML and extract all sections.
 *
 * Strategy:
 *   1. Split on <h3 id="t16cNNs…"> tags — each match is one section heading.
 *   2. From the h3 id, extract chapterNum and sectionNum.
 *   3. Title = text of the <b> inside the h3.
 *   4. Body = text of <p> tags that follow the h3 closing tag,
 *      stopping at the next h3 or a <div> with judicial-decisions/research-references id.
 *
 * @param {string} html - Full content of gov.ga.ocga.title.16.html
 * @returns {GaSection[]}
 */
export function parseTitleSections(html) {
  // Match every section h3 — id patterns vary by chapter structure:
  //   simple:  t16c01s16-1-1            (chapter only)
  //   article: t16c03a01s16-3-1         (chapter + article)
  //   part:    t16c12a02p01s16-12-20    (chapter + article + part)
  // Capture group 1 = chapter digits, group 2 = section digits (e.g. "16-3-21")
  const H3_PATTERN = /<h3\s+id="t16c(\d+)(?:a\d+)?(?:p\d+)?s([\d-]+)"\s*>/g;

  const positions = [];
  let match;

  while ((match = H3_PATTERN.exec(html)) !== null) {
    positions.push({
      index: match.index,
      end: match.index + match[0].length,
      chapterNum: String(parseInt(match[1], 10)),  // "01" → "1"
      sectionNum: match[2],                         // "16-1-1"
    });
  }

  const sections = [];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    // Content window: from this h3 opening to the next h3 (or 50K limit)
    const nextStart = i + 1 < positions.length ? positions[i + 1].index : pos.end + 50000;
    const chunkEnd = Math.min(nextStart, html.length);
    const chunk = html.slice(pos.end, chunkEnd);

    // --- Title text: first <b>…</b> within 500 chars of the h3 opening ---
    const titleMatch = /<b>([\s\S]*?)<\/b>/i.exec(html.slice(pos.index, pos.end + 500));
    const titleText = titleMatch ? stripHtml(titleMatch[1]) : '';
    if (!titleText) continue;

    // --- Body text ---
    const bodyText = extractBodyText(chunk);
    if (!bodyText) continue;

    sections.push({
      chapterNum: pos.chapterNum,
      sectionNum: pos.sectionNum,
      titleText: sanitiseTitle(titleText, pos.sectionNum),
      bodyText,
    });
  }

  return sections;
}

/**
 * Extract body text from the HTML chunk after the h3 closing tag.
 * Stops at judicial-decisions divs, other headings, or navigation content.
 */
function extractBodyText(chunk) {
  const h3Close = chunk.indexOf('</h3>');
  if (h3Close === -1) return '';
  const afterH3 = chunk.slice(h3Close + 5);

  // Stop markers — signal end of substantive statutory body
  const STOP_PATTERNS = [
    /<div[^>]+id="[^"]*judicialdecision[^"]*"/i,
    /<div[^>]+id="[^"]*researchreferences[^"]*"/i,
    /<div[^>]+id="[^"]*lawreviews[^"]*"/i,
    /<h3[\s>]/i,
    /<h2[\s>]/i,
  ];

  let stopAt = afterH3.length;
  for (const pat of STOP_PATTERNS) {
    const m = pat.exec(afterH3);
    if (m && m.index < stopAt) stopAt = m.index;
  }

  const bodyChunk = afterH3.slice(0, stopAt);
  const paragraphs = [];

  // Primary: extract <p> content
  const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pPattern.exec(bodyChunk)) !== null) {
    const text = stripHtml(m[1]);
    if (text && !isHistoryLine(text)) paragraphs.push(text);
  }

  // Fallback: extract <li> content (some sections are all <ol>)
  if (paragraphs.length === 0) {
    const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    while ((m = liPattern.exec(bodyChunk)) !== null) {
      const text = stripHtml(m[1]);
      if (text && !isHistoryLine(text)) paragraphs.push(text);
    }
  }

  return paragraphs.join(' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
}

/**
 * History/citation lines look like "(Laws 1833,…)" or "(Ga. L. 1968, p. 1249…)".
 * They add no semantic value to the statute body — skip them.
 */
function isHistoryLine(text) {
  const t = text.trim();
  return /^\([\w\s.,;–\-]+\)$/.test(t) ||
         /^\((?:Code|Laws|Ga\. L\.|Acts)\s/.test(t);
}

/**
 * Strip the leading "16-X-Y. " prefix from a title (already stored as sectionNum).
 * e.g. "16-1-1. Short title." → "Short title."
 */
function sanitiseTitle(raw, sectionNum) {
  const prefix = sectionNum + '. ';
  if (raw.startsWith(prefix)) return raw.slice(prefix.length);
  const prefixDot = sectionNum + '.';
  if (raw.startsWith(prefixDot)) return raw.slice(prefixDot.length).trim();
  return raw;
}

/**
 * Build the Justia authoritative URL for a GA OCGA section.
 * Pattern: https://law.justia.com/codes/georgia/section/{section-num}/
 * (confirmed from robots.txt structure + Justia URL scheme docs)
 *
 * @param {string} sectionNum e.g. "16-3-21"
 * @returns {string}
 */
export function buildJustiaUrl(sectionNum) {
  return `https://law.justia.com/codes/georgia/section/${sectionNum}/`;
}
