// Pattern: cl-bulk-data-defensive #18 + no-hallucinated-legal-data
// Pattern: bucket-b-html.mjs harness contract (NY uses CUSTOM walker; tree is multi-level)
// Template: scripts/ingest/lib/mn-html.mjs (decodeEntities/stripHtml shape)
//
// HTML parsing helpers for nysenate.gov NY Penal Law (PEN).
//
// Live structure verified 2026-05-02 against fixtures captured under
// scripts/ingest/__tests__/fixtures/ny/:
//   /legislation/laws/PEN              -> 4 PART links: P1, P2, P3, P4
//   /legislation/laws/PEN/P1           -> N TITLE links: P1TA, P1TB, P1TC, ...
//   /legislation/laws/PEN/P1TA         -> M ARTICLE links: P1TAA1, P1TAA5, P1TAA10, ...
//   /legislation/laws/PEN/P1TAA1       -> K SECTION links: 1.00, 1.05, ...
//   /legislation/laws/PEN/125.25       -> leaf section (Murder 2nd)
//
// Discriminators:
//   - Branch link (PART/TITLE/ARTICLE): final path segment matches /^[A-Z][A-Z0-9]+$/
//     i.e. starts with uppercase letter, no dot. e.g. P1, P1TA, P1TAA1, -CH40.
//   - Leaf SECTION link: final path segment matches /^\d+(\.\d+[A-Z\-]*[\d.]*)?[A-Z]?$/
//     i.e. starts with a digit, often dotted decimal (1.00, 125.25, 70.06).
//
// Section page shape (verified on 125.25 fixture):
//   <h2 class="nys-openleg-result-title-headline">SECTION 125.25</h2>
//   <h3 class="nys-openleg-result-title-short">Murder in the second degree</h3>
//   <h4 class="nys-openleg-result-title-location">Penal (PEN) CHAPTER 40, PART 3, TITLE H, ARTICLE 125</h4>
//   <div class="nys-openleg-result-text">{statute body w/ <br/> separators}</div>
//
// Robots: nysenate.gov has no Crawl-delay (verified 2026-05-02). 1500ms polite
// delay applied at the orchestrator layer. Cloudflare-fronted; works with
// browser-shape User-Agent + Accept-Language headers.

const NY_BASE_URL = 'https://www.nysenate.gov';
export const NY_BASE = NY_BASE_URL;
export const NY_PEN_ROOT_URL = `${NY_BASE_URL}/legislation/laws/PEN`;

// ── Decode entities (mirror mn-html.mjs) ──────────────────────────────────
export function decodeEntities(s) {
  if (!s) return '';
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

// ── Strip tags (preserve <br> as newline; mirror mn-html.mjs) ─────────────
export function stripHtml(html) {
  if (!html) return '';
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n\n');
  s = s.replace(/<\/h\d>/gi, '\n');
  s = s.replace(/<\/div>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.split('').filter((ch) => {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13) return true;
    if (c < 32) return false;
    if (c === 127) return false;
    return true;
  }).join('');
  // Collapse runs of spaces but preserve newlines as paragraph separators.
  return s
    .split('\n')
    .map((line) => line.split(/[ \t\f\v]+/).filter(Boolean).join(' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}

// ── URL builders ───────────────────────────────────────────────────────────

/**
 * Authoritative source URL for a NY PEN section. Same path shape as the
 * discovery URL, used in source_urls[] for the row.
 *
 * @param {string} sectionNum  e.g. "125.25"
 * @returns {string}
 */
export function buildNySourceUrl(sectionNum) {
  const safe = String(sectionNum).trim().replace(/[^\w.\-]/g, '');
  return `${NY_BASE_URL}/legislation/laws/PEN/${safe}`;
}

/**
 * Root TOC URL for PEN. Stable since at least 2026-05-02.
 * @returns {string}
 */
export function buildPenRootUrl() {
  return NY_PEN_ROOT_URL;
}

// ── Link classification ───────────────────────────────────────────────────

const BRANCH_RX = /^[A-Z\-][A-Z0-9\-]*$/;        // P1, P1TA, P1TAA1, -CH40
const SECTION_RX = /^\d+(?:\.\d+)?[A-Z\-]?$/;    // 1.00, 125.25, 70.06, 70.85, 35-A?

/**
 * Classify a NY PEN URL's final path segment:
 *   'branch'  — PART/TITLE/ARTICLE/CHAPTER intermediate (recurse into it)
 *   'section' — leaf statute section (fetch + parse)
 *   'unknown' — skip
 *
 * Branch detection covers: P1..P4, P1TA..P3TZ, P1TAA1.., -CH40 (chapter
 * back-link surfacing as nav). Sections are dotted-decimal IDs.
 *
 * @param {string} url
 * @returns {'branch'|'section'|'unknown'}
 */
export function classifyLink(url) {
  let u;
  try { u = new URL(url); } catch { return 'unknown'; }
  const host = u.hostname.toLowerCase();
  if (host !== 'www.nysenate.gov' && host !== 'nysenate.gov') return 'unknown';
  // Path must be /legislation/laws/PEN/<segment> with exactly one segment
  // beyond PEN. We discard PEN itself and any deeper / fragment URLs.
  const m = u.pathname.match(/^\/legislation\/laws\/PEN\/([^\/]+)\/?$/);
  if (!m) return 'unknown';
  const seg = m[1];
  if (SECTION_RX.test(seg)) return 'section';
  if (BRANCH_RX.test(seg)) return 'branch';
  return 'unknown';
}

/**
 * Extract child links (branches AND sections) from any NY openleg index page
 * (PEN root, a Part page, a Title page, an Article page).
 *
 * Strategy: pull all anchors with class `nys-openleg-result-item-link` (the
 * forward-children list). Drop nav-only links (chapter back-link `-CH40`,
 * sibling-part nav links via `nys-openleg-result-nav-item-link`). Dedupe by
 * URL. Ignore anchors whose final segment is `PEN` itself.
 *
 * Returns absolute URLs in document order, preserving uniqueness.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function discoverChildLinks(html) {
  if (!html) return [];
  // Constrain to forward-children container — class `nys-openleg-result-item-link`.
  // Robust to attribute order. Capture the href value.
  const out = [];
  const seen = new Set();
  const anchorRx = /<a\b[^>]*\bclass\s*=\s*"([^"]*)"[^>]*\bhref\s*=\s*"([^"]+)"|<a\b[^>]*\bhref\s*=\s*"([^"]+)"[^>]*\bclass\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = anchorRx.exec(html)) !== null) {
    const cls = m[1] || m[4] || '';
    const href = m[2] || m[3] || '';
    if (!cls.includes('nys-openleg-result-item-link')) continue;
    let abs;
    if (href.startsWith('http://') || href.startsWith('https://')) abs = href;
    else if (href.startsWith('/')) abs = NY_BASE_URL + href;
    else continue;
    // De-fragment, drop trailing slash.
    abs = abs.split('#')[0].replace(/\/$/, '');
    if (seen.has(abs)) continue;
    const cls2 = classifyLink(abs);
    if (cls2 === 'unknown') continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

/**
 * Extract section number from a section URL. Throws on unparseable input
 * to mirror sectionIdFromUrl in mn-html.mjs.
 *
 * @param {string} url
 * @returns {string}  e.g. "125.25"
 */
export function sectionIdFromUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error(`invalid URL: ${url}`); }
  const m = u.pathname.match(/^\/legislation\/laws\/PEN\/([^\/]+)\/?$/);
  if (!m || !SECTION_RX.test(m[1])) {
    throw new Error(`URL is not a NY PEN section URL: ${url}`);
  }
  return m[1];
}

// ── Section page parser ───────────────────────────────────────────────────

/**
 * Parse a single section page into {titleText, bodyText} or null.
 *
 * Returns null when:
 *   - HTML too short (<500 bytes — error/blank pages)
 *   - SECTION headline doesn't match the requested section number
 *   - body div empty/repealed-shell after stripHtml (<10 chars)
 *
 * Title composition: "<short headline>" (the human title), e.g.
 * "Murder in the second degree". This matches MN/MA convention so the
 * downstream section_text composition `${title}\n\n${body}` reads cleanly.
 *
 * @param {string} html         full page HTML
 * @param {string} sectionNum   expected section number, e.g. "125.25"
 * @returns {{titleText: string, bodyText: string}|null}
 */
export function parseSection(html, sectionNum) {
  if (!html || typeof html !== 'string' || html.length < 500) return null;
  const wantSec = String(sectionNum).trim();

  // Headline anchors the page identity — must match requested section.
  const headlineRx = /<h2\b[^>]*class="[^"]*nys-openleg-result-title-headline[^"]*"[^>]*>([\s\S]*?)<\/h2>/i;
  const headlineMatch = html.match(headlineRx);
  if (!headlineMatch) return null;
  const headline = stripHtml(headlineMatch[1]);
  // Headline format: "SECTION 125.25" — be tolerant of casing/whitespace.
  const secMatch = headline.match(/SECTION\s+([0-9][\w.\-]*)/i);
  if (!secMatch) return null;
  if (secMatch[1].toLowerCase() !== wantSec.toLowerCase()) return null;

  // Short title — the human descriptor.
  const shortRx = /<h3\b[^>]*class="[^"]*nys-openleg-result-title-short[^"]*"[^>]*>([\s\S]*?)<\/h3>/i;
  const shortMatch = html.match(shortRx);
  const titleText = shortMatch ? stripHtml(shortMatch[1]).trim() : `Section ${wantSec}`;

  // Body container — official statute text with <br/> formatting.
  const bodyRx = /<div\b[^>]*class="[^"]*nys-openleg-result-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
  const bodyMatch = html.match(bodyRx);
  if (!bodyMatch) return null;
  const bodyText = stripHtml(bodyMatch[1]).trim();

  if (!bodyText || bodyText.length < 10) return null;
  // Reject "repealed" shells where the body is just a marker line.
  if (/^\*?\s*Repealed\b/i.test(bodyText) && bodyText.length < 60) return null;

  return {
    titleText: titleText || `Section ${wantSec}`,
    bodyText,
  };
}

// ── TOC walker (multi-level) ──────────────────────────────────────────────

/**
 * Walk the NY PEN TOC tree iteratively. Caller provides an async fetcher
 * that returns HTML for a given URL. Returns ALL section URLs discovered
 * (deduped, document-order-stable).
 *
 * The walk strategy:
 *   1. Start with [PEN root URL] queue.
 *   2. Pop URL. Fetch HTML via fetcher.
 *   3. discoverChildLinks(html) -> children.
 *   4. For each child: classify; sections -> output; branches -> queue.
 *   5. Repeat until queue empty. Bound by maxBranchPages safeguard (default 200)
 *      to prevent runaway in case of unexpected nav loops.
 *
 * Throws if maxBranchPages exceeded.
 *
 * @param {(url: string) => Promise<string>} fetcher
 * @param {{ maxBranchPages?: number, onBranch?: (url: string, depth: number) => void }} [opts]
 * @returns {Promise<string[]>}  absolute section URLs
 */
export async function walkPenToc(fetcher, opts = {}) {
  const { maxBranchPages = 200, onBranch } = opts;
  const queue = [{ url: NY_PEN_ROOT_URL, depth: 0 }];
  const visited = new Set();
  const sections = [];
  const sectionSeen = new Set();
  let branchCount = 0;

  while (queue.length) {
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    branchCount++;
    if (branchCount > maxBranchPages) {
      throw new Error(`walkPenToc: exceeded maxBranchPages=${maxBranchPages} (likely TOC loop or shape change)`);
    }
    if (onBranch) onBranch(url, depth);
    let html;
    try { html = await fetcher(url); } catch (e) {
      throw new Error(`walkPenToc: fetch failed for ${url}: ${e.message}`);
    }
    const children = discoverChildLinks(html);
    for (const child of children) {
      const cls = classifyLink(child);
      if (cls === 'section') {
        if (!sectionSeen.has(child)) {
          sectionSeen.add(child);
          sections.push(child);
        }
      } else if (cls === 'branch') {
        // Skip back-nav links like /-CH40 to avoid bouncing back up. The
        // back-nav surfaces under classifyLink as 'branch' because seg=-CH40
        // matches BRANCH_RX. Visited-set + queue-dedupe covers the loop case
        // for any branch revisit.
        if (!visited.has(child)) {
          queue.push({ url: child, depth: depth + 1 });
        }
      }
    }
  }
  return sections;
}
