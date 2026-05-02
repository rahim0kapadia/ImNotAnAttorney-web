// Template: scripts/ingest/lib/ga-html.mjs
// Pattern: cl-bulk-data-defensive #18 — PA Title 18 is fetched per-section via palegis.us iframe URLs
// Source: https://www.palegis.us/statutes/consolidated/view-statute?30&iFrame=true&txtType=HTM&ttl=18&div=0&chpt={C}&sctn={S}&subsctn=0
//
// PA HTML structure (palegis.us iframe — per section page):
//   <div class="Comment">18c{NUM}s</div>  ← statute ("s" suffix), parse
//   <div class="Comment">18c{NUM}h</div>  ← chapter header ("h" suffix), skip
//   <div class="BodyContainer">
//     <b> § {SECNUM}.&nbsp;&nbsp;{TITLE}</b>
//     <p>Body paragraph...</p>
//     <p>History. ...</p>   ← stop before history
//   </div>
//
// TOC page structure (full-title single iframe, div=0&chpt=0&sctn=0):
//   <a href="view-statute?txtType=HTM&amp;ttl=18&amp;div={D}&amp;chpt={C}&amp;sctn={S}&amp;subsctn=0">
//   (subsctn=0 links only; subsctn!=0 = sub-section anchors, skip)
//
// Section number formula: chpt * 100 + sctn_param
//   e.g. chpt=25, sctn=3 → section 2503
//
// Authoritative source URL:
//   https://www.palegis.us/statutes/consolidated/view-statute?30&iFrame=true&txtType=HTM&ttl=18&div={D}&chpt={C}&sctn={S}&subsctn=0

/**
 * @typedef {Object} PaTocEntry
 * @property {number} div
 * @property {number} chpt
 * @property {number} sctn
 * @property {number} sectionNum   chpt*100 + sctn (e.g. 2503)
 */

/**
 * Strip HTML tags, decode entities, drop control chars, collapse whitespace.
 * Order: strip scripts/styles → strip tags → decode entities → second-pass strip
 * → drop C0 controls → collapse whitespace (mirrors fl-html.mjs for hash integrity).
 *
 * @param {string} html
 * @returns {string}
 */
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
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return '';
      if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return '';
      if (code === 0x7f) return '';
      if (code >= 0xd800 && code <= 0xdfff) return '';
      return String.fromCodePoint(code);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = Number.parseInt(n, 16);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return '';
      if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return '';
      if (code === 0x7f) return '';
      if (code >= 0xd800 && code <= 0xdfff) return '';
      return String.fromCodePoint(code);
    });
  // Second-pass tag strip — catches any tags materialized from decoded entities.
  s = s.replace(/<[^>]+>/g, ' ');
  // Drop control chars that survived.
  s = s
    .split('')
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      if (c === 9 || c === 10 || c === 13) return true;
      if (c < 32) return false;
      if (c === 127) return false;
      return true;
    })
    .join('');
  return s.split(/\s+/).filter(Boolean).join(' ').trim();
}

/**
 * Determine whether a section page is a chapter header (not a statute).
 * Chapter header pages have a Comment div ending in "h" (e.g. "18c101h").
 * Statute pages end in "s" (e.g. "18c2503s").
 *
 * @param {string} html
 * @returns {boolean}
 */
export function isChapterHeader(html) {
  if (!html) return true;
  // Look for Comment div — chapter headers end in "h", statutes in "s"
  const m = /<div[^>]+class="Comment"[^>]*>([^<]*)<\/div>/i.exec(html);
  if (!m) return false; // unknown — treat as statute (fail-open parse attempt)
  const val = m[1].trim().toLowerCase();
  return val.endsWith('h');
}

/**
 * Detect a section page that returned a 404-as-200 or non-existent section.
 *
 * @param {string} html
 * @returns {boolean}
 */
export function isSectionNotFound(html) {
  if (!html) return true;
  if (html.length < 200) return true;
  if (/no\s+data\s+found/i.test(html)) return true;
  if (/section\s+not\s+found/i.test(html)) return true;
  return false;
}

/**
 * Extract TOC entries from the full-title single-page HTML.
 * Only subsctn=0 links are included — subsctn!=0 are sub-section anchors.
 *
 * URL shape in TOC HTML (HTML-encoded ampersands):
 *   view-statute?txtType=HTM&amp;ttl=18&amp;div=0&amp;chpt=25&amp;sctn=3&amp;subsctn=0
 *
 * @param {string} html — full title TOC page HTML
 * @returns {PaTocEntry[]}
 */
export function parseTitleToc(html) {
  if (!html) return [];

  const seen = new Set();
  const results = [];

  // Match links with ttl=18 and subsctn=0, capturing div/chpt/sctn
  // Handles both &amp; encoded and raw & forms
  const linkRx =
    /view-statute\?[^"'<>]*?ttl=18[^"'<>]*?div=(\d+)[^"'<>]*?chpt=(\d+)[^"'<>]*?sctn=(\d+)[^"'<>]*?subsctn=0/gi;

  let m;
  while ((m = linkRx.exec(html)) !== null) {
    const div = Number.parseInt(m[1], 10);
    const chpt = Number.parseInt(m[2], 10);
    const sctn = Number.parseInt(m[3], 10);
    if (Number.isNaN(chpt) || Number.isNaN(sctn)) continue;
    const sectionNum = chpt * 100 + sctn;
    const key = `${div}:${chpt}:${sctn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ div, chpt, sctn, sectionNum });
  }

  // Sort numerically by section number
  results.sort((a, b) => a.sectionNum - b.sectionNum || a.sctn - b.sctn);
  return results;
}

/**
 * Parse a PA statute section page into {titleText, bodyText}.
 * Returns null if page is a chapter header or not found.
 *
 * Title: <b> § {SECNUM}.&nbsp;&nbsp;{TITLE}</b>
 * Body: <p> tags inside .BodyContainer, stopping at "History." line.
 *
 * @param {string} html
 * @param {number} sectionNum  e.g. 2503
 * @returns {{titleText: string, bodyText: string} | null}
 */
export function parseSectionPage(html, sectionNum) {
  if (isSectionNotFound(html)) return null;
  if (isChapterHeader(html)) return null;

  // --- Title extraction ---
  // PA format: <b> &#167; 2503.&nbsp;&nbsp;Voluntary manslaughter.</b>
  // The § sign is entity-encoded as &#167; in palegis.us iframe HTML.
  let titleText = null;
  const titleRx = /<b[^>]*>\s*(?:§|&#167;|&#xA7;)\s*[\d.]+[^<]*<\/b>/i;
  const titleMatch = titleRx.exec(html);
  if (titleMatch) {
    const stripped = stripHtml(titleMatch[0]);
    // Remove leading "§ NNNN. " prefix (§ decoded from &#167; by stripHtml)
    titleText = stripped.replace(/^§\s*[\d.]+\.*\d*\.*\s*/, '').trim();
    // If title is empty after strip (e.g. just the section number), fall through
    if (!titleText) titleText = null;
  }
  if (!titleText) titleText = `Section ${sectionNum}`;

  // --- Body extraction ---
  // Scope to .BodyContainer div
  let workHtml = html;
  const bodyContainerStart = html.search(/class="BodyContainer"/i);
  if (bodyContainerStart >= 0) {
    const afterOpen = html.indexOf('>', bodyContainerStart) + 1;
    workHtml = html.slice(afterOpen);
  }

  const paragraphs = [];
  const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pm;
  while ((pm = pPattern.exec(workHtml)) !== null) {
    const text = stripHtml(pm[1]);
    if (!text) continue;
    // Stop at history/source note lines
    if (/^History\./i.test(text)) break;
    if (/^\([\d\s,;A-Z.P.-]+\)$/.test(text.trim())) continue; // parenthetical source notes
    paragraphs.push(text);
  }

  // Fallback: if no <p> tags, extract plain text from BodyContainer and strip title
  if (paragraphs.length === 0 && bodyContainerStart >= 0) {
    const raw = stripHtml(workHtml.slice(0, 15000));
    // Strip the leading title (§ NNNN. Title.) from body text
    const trimmed = raw.replace(/^§\s*[\d.]+\.?\d*\.?\s*[-–]?\s*[^.]+\.\s*/, '').trim();
    if (trimmed.length > 10) paragraphs.push(trimmed);
  }

  const bodyText = paragraphs
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20000);

  if (!bodyText || bodyText.length < 10) return null;

  return { titleText, bodyText };
}

/**
 * Build the authoritative palegis.us source URL for a PA Title 18 section.
 *
 * @param {number} div
 * @param {number} chpt
 * @param {number} sctn
 * @returns {string}
 */
export function buildPaUrl(div, chpt, sctn) {
  return `https://www.palegis.us/statutes/consolidated/view-statute?30&iFrame=true&txtType=HTM&ttl=18&div=${div}&chpt=${chpt}&sctn=${sctn}&subsctn=0`;
}
