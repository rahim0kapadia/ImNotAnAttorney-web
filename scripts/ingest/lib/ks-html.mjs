// Template: scripts/ingest/lib/ar-xml.mjs (single-doc parse pattern)
// Pattern: cl-bulk-data-defensive #18 — COPY FROM STDIN via bulkCopyRows (via bucket-b-html harness)
// Pattern: cl-bulk-data-defensive #17 — session-level timeouts via createBulkClient
// Source: Kansas Revisor of Statutes — https://ksrevisor.gov/statutes/ksa_ch21.html
//   (chapter 21 = Crimes and Punishments)
//
// KS Chapter 21 publishes a chapter index page with one <li> per section. The
// page is pretty-printed: each <li> spans multiple lines with the section number
// on its own line followed by an <a> wrapping the title text. Real shape (verified
// live 2026-05-02):
//
//   <li>
//    21-5401
//    <a href="/statutes/chapters/ch21/021_054_0001.html">
//     Capital murder.
//    </a>
//   </li>
//
// Repealed/Reserved entries have the same shape with status text inside the <a>:
//
//   <li>
//    21-3401
//    <a href="/statutes/chapters/ch21/021_034_0001.html">
//     Repealed.
//    </a>
//   </li>
//
// The link text marks status: "Reserved." / "Repealed." / "Transferred." / "Expired."
// indicate non-active sections; everything else is the active title.
//
// Per Wave 2 plan KS row + ksrevisor.gov live verification 2026-05-02:
//   - Section URL pattern: /statutes/chapters/ch21/021_{article-3-pad}_{section-4-pad}.html
//   - Active scope: Articles 51-63 (modern criminal code post-2010 recodification)
//   - robots.txt: no Crawl-delay (verify at runtime)
//
// Source URL strategy: the index <li>'s embedded href IS the canonical permalink on
// ksrevisor.gov; we capture and re-emit it via buildKSSourceUrl.
//
// HARD: no regex on file contents — parser uses indexOf-based scanning per
// `gotcha-no-regex-on-files.md`. Regex permitted on STRINGS we extract (small
// in-memory snippets), not on the full HTML blob.

/**
 * @typedef {Object} KSSection
 * @property {string} chapterNum   Article number, e.g. "54", "62"
 * @property {string} sectionNum   Full section number, e.g. "21-5401", "21-3524a"
 * @property {string} sectionUrl   Absolute HTTPS URL on ksrevisor.gov
 * @property {string} statusLabel  Active title text OR "Repealed." / "Reserved." / "Transferred." / "Expired."
 * @property {boolean} isActive    True iff statusLabel is not one of the inactive markers
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KS_HOST = 'https://ksrevisor.gov';

const INACTIVE_MARKERS = new Set([
  'repealed.',
  'reserved.',
  'transferred.',
  'expired.',
  'revoked.',
  'rejected.',
]);

// Modern Kansas criminal code articles (post-2010 recodification).
// Articles 51-63 contain active criminal statutes. Articles 1-50 are mostly
// pre-2010 sections that have been transferred or repealed; we keep them in the
// parse output but flag isActive=false for non-active sections via the
// statusLabel detection above. The seeder filters the descriptor list.
const ACTIVE_ARTICLE_MIN = 51;
const ACTIVE_ARTICLE_MAX = 63;

// ---------------------------------------------------------------------------
// HTML entity decode + strip (mirrors ar-xml.mjs.stripHtml shape)
// ---------------------------------------------------------------------------

/**
 * Decode HTML entities and strip HTML tags.
 * Used on individual snippets we've already extracted via indexOf — never on
 * the full chapter HTML blob.
 */
export function stripHtml(raw) {
  if (!raw) return '';
  let s = String(raw);
  // Decode common entities first
  s = s.split('&lt;').join('<');
  s = s.split('&gt;').join('>');
  s = s.split('&quot;').join('"');
  s = s.split('&apos;').join("'");
  s = s.split('&#167;').join('§');
  s = s.split('&sect;').join('§');
  s = s.split('&#xa7;').join('§');
  s = s.split('&#xA7;').join('§');
  s = s.split('&nbsp;').join(' ');
  s = s.split('&#160;').join(' ');
  s = s.split('&amp;').join('&');
  // Numeric entities (decimal)
  s = s.replace(/&#(\d+);/g, (_, dec) => {
    const n = Number(dec);
    if (!Number.isFinite(n) || n < 0 || n > 0x10FFFF) return ' ';
    try { return String.fromCodePoint(n); } catch { return ' '; }
  });
  // Strip script/style blocks via indexOf scan (no regex on contents)
  s = stripBlock(s, '<script', '</script>');
  s = stripBlock(s, '<style', '</style>');
  // Strip remaining tags via indexOf scan
  s = stripTagsByScan(s);
  // Collapse whitespace
  s = s.replace(/[\s ]+/g, ' ').trim();
  return s;
}

function stripBlock(s, openPrefix, closeTag) {
  let out = '';
  let pos = 0;
  while (pos < s.length) {
    const open = s.indexOf(openPrefix, pos);
    if (open === -1) { out += s.slice(pos); break; }
    out += s.slice(pos, open);
    const close = s.indexOf(closeTag, open);
    if (close === -1) { break; }
    pos = close + closeTag.length;
  }
  return out;
}

function stripTagsByScan(s) {
  let out = '';
  let pos = 0;
  while (pos < s.length) {
    const lt = s.indexOf('<', pos);
    if (lt === -1) { out += s.slice(pos); break; }
    out += s.slice(pos, lt);
    const gt = s.indexOf('>', lt);
    if (gt === -1) break;
    pos = gt + 1;
    out += ' ';
  }
  return out;
}

// ---------------------------------------------------------------------------
// Index page parser — emits one descriptor per <li>
// ---------------------------------------------------------------------------

/**
 * Parse the KS chapter 21 index page into structured section descriptors.
 *
 * Strategy:
 *   1. Locate every <li> ... </li> block via indexOf.
 *   2. For each block, extract the section number from anywhere inside (must
 *      match /\b21-\d+[a-z]*\b/), the first /statutes/chapters/ch21/... href,
 *      and the first <a> link text.
 *   3. Classify status from link text (active title vs Repealed/Reserved/...).
 *
 * Robust to: pretty-printed multi-line <li>s, leading whitespace,
 * <li>...non-21 number...</li> blocks (filtered by section-num regex miss).
 *
 * @param {string} html - Full chapter index HTML
 * @returns {KSSection[]}
 */
export function parseKSChapter21(html) {
  if (!html || typeof html !== 'string') return [];
  const sections = [];
  const seen = new Set();
  const LI_OPEN = '<li';
  const LI_CLOSE = '</li>';
  let pos = 0;

  while (pos < html.length) {
    const liStart = html.indexOf(LI_OPEN, pos);
    if (liStart === -1) break;
    // Find end of the opening <li ...> tag — could be <li> or <li class="...">
    const openTagEnd = html.indexOf('>', liStart);
    if (openTagEnd === -1) break;
    const liEnd = html.indexOf(LI_CLOSE, openTagEnd);
    if (liEnd === -1) break;

    const inner = html.slice(openTagEnd + 1, liEnd);
    pos = liEnd + LI_CLOSE.length;

    // Must contain a /ch21/ section href; otherwise skip (filters non-section
    // <li>s like nav/footer items)
    const href = extractCh21Href(inner);
    if (!href) continue;

    const sectionNum = extractKSSectionNumLoose(inner);
    if (!sectionNum) continue;
    if (seen.has(sectionNum)) continue;

    const linkText = stripHtml(extractFirstLinkText(inner));
    if (!linkText) continue;

    const sectionUrl = absoluteSectionUrl(href);
    if (!sectionUrl) continue;

    const statusLabel = linkText;
    const isActive = !INACTIVE_MARKERS.has(linkText.trim().toLowerCase());
    const chapterNum = deriveArticleNumber(sectionNum, href);

    seen.add(sectionNum);
    sections.push({
      chapterNum,
      sectionNum,
      sectionUrl,
      statusLabel,
      isActive,
    });
  }

  return sections;
}

/**
 * Filter a parsed descriptor list to active sections in modern criminal code
 * articles (51-63). Used by the seeder pre-fetch to skip Repealed/Reserved
 * entries and pre-2010 transferred sections.
 *
 * @param {KSSection[]} sections
 * @returns {KSSection[]}
 */
export function filterActiveSections(sections) {
  return sections.filter(s => {
    if (!s.isActive) return false;
    const art = parseInt(s.chapterNum, 10);
    if (!Number.isFinite(art)) return false;
    return art >= ACTIVE_ARTICLE_MIN && art <= ACTIVE_ARTICLE_MAX;
  });
}

// ---------------------------------------------------------------------------
// Section page parser — extract titleText + bodyText from one section HTML
// ---------------------------------------------------------------------------

/**
 * Parse a single KS section page (e.g. .../021_054_0001.html).
 *
 * Real section page shape (verified live against ksrevisor.gov 2026-05-02):
 *   <div id="print">
 *     <div>
 *       <p class="ksa_stat">
 *         <span class="stat_number">21-5401.</span>
 *         <span class="stat_caption">Capital murder.</span>
 *         (a) Capital murder is the:
 *       </p>
 *       <p class="ksa_stat">(1) Intentional and premeditated killing...</p>
 *       <p class="ksa_stat">(2) intentional...</p>
 *       ...
 *       <p class="history_stat">History: L. 2010, ch. 136, § 36; ...</p>
 *       <p class="src_stat">Source or Prior Law: 21-3439.</p>
 *     </div>
 *   </div>
 *
 * Title is in <span class="stat_caption">; body is everything else inside
 * <div id="print"> stripped to text.
 *
 * Returns null when the page lacks a parseable stat_caption or body.
 *
 * @param {string} html
 * @param {string} sectionNum  e.g. "21-5401"
 * @returns {{titleText: string, bodyText: string}|null}
 */
export function parseKSSectionPage(html, sectionNum) {
  if (!html || typeof html !== 'string') return null;

  // 1. Title — find the first stat_caption span
  const titleText = extractStatCaption(html);
  if (!titleText) return null;

  // 2. Body — locate <div id="print"> and take its inner content; if not
  // present, fall back to scanning every p.ksa_stat across the whole HTML.
  const bodyHtml = extractPrintDivInner(html) || extractStatParagraphs(html);
  if (!bodyHtml) return null;

  let bodyText = stripHtml(bodyHtml);
  bodyText = stripFooterArtifacts(bodyText);
  // Drop the leading "{sectionNum}. {titleText}." prefix that gets pulled in
  // when we strip the print-div as one block.
  bodyText = stripLeadingHeading(bodyText, sectionNum, titleText);
  bodyText = bodyText.slice(0, 49000);

  if (!bodyText || bodyText.length < 8) return null;

  return { titleText, bodyText };
}

// ---------------------------------------------------------------------------
// Source URL builder
// ---------------------------------------------------------------------------

/**
 * Build the canonical ksrevisor.gov URL for a KS section.
 *
 * Pattern: /statutes/chapters/ch21/021_{article-3-pad}_{section-4-pad}.html
 *   "21-5401"  → /statutes/chapters/ch21/021_054_0001.html
 *   "21-3524a" → /statutes/chapters/ch21/021_035_0024a.html  (uncommon — verified empirically per state)
 *
 * Section number decomposition:
 *   "21-NNNN[a-z]?" — strip "21-" prefix; the trailing letter (if any) preserves;
 *   the digit run splits into {article = leading digits} and {section = trailing 2 digits}.
 *   Examples:  "5401" → article 54, section 01 ; "101" → article 1, section 01.
 *
 * @param {string} sectionNum  e.g. "21-5401" or "21-3524a"
 * @returns {string} HTTPS URL on ksrevisor.gov
 */
export function buildKSSourceUrl(sectionNum) {
  if (!sectionNum || typeof sectionNum !== 'string') {
    throw new Error('buildKSSourceUrl: sectionNum required');
  }
  const m = /^21-(\d+)([a-z]*)$/.exec(sectionNum.trim());
  if (!m) throw new Error(`buildKSSourceUrl: invalid sectionNum "${sectionNum}"`);
  const digits = m[1];
  const suffix = m[2] || '';
  if (digits.length < 3) {
    // Section like "21-99" cannot decompose — KS publishes minimum 3 digits
    // (article + 2-pad section). Defensive throw rather than silently mangle.
    throw new Error(`buildKSSourceUrl: "${sectionNum}" too short to split`);
  }
  const articleStr = digits.slice(0, digits.length - 2);
  const sectionStr = digits.slice(digits.length - 2);
  const articlePad = articleStr.padStart(3, '0');
  const sectionPad = (sectionStr + suffix).padStart(4, '0');
  return `${KS_HOST}/statutes/chapters/ch21/021_${articlePad}_${sectionPad}.html`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the KS section number from anywhere in a <li> inner. The section
 * number appears as standalone text "21-NNNN[a-z]?" surrounded by whitespace
 * (KS index pretty-prints it on its own line).
 *
 * Operates on a SHORT in-memory string slice (the <li> inner), so regex is OK
 * here per cl-bulk-data-defensive escape ("regex on extracted strings, not on
 * full file blob").
 */
function extractKSSectionNumLoose(liInner) {
  // Match "21-" followed by 1+ digits with optional alpha suffix, bounded by
  // non-word char or string boundary. \b after [a-z]* may not fire because
  // [a-z] is followed by '<' or whitespace, so use a manual look-ahead.
  const m = /(?:^|[^\w-])(21-\d+[a-z]*)(?=[^\w-]|$)/.exec(liInner);
  if (!m) return '';
  return m[1];
}

/**
 * Extract the first href that points at /statutes/chapters/ch21/. Other links
 * (e.g. footer nav) are ignored. Returns '' if none.
 */
function extractCh21Href(liInner) {
  const NEEDLE = '/statutes/chapters/ch21/';
  let pos = 0;
  while (pos < liInner.length) {
    const aStart = liInner.indexOf('<a', pos);
    if (aStart === -1) return '';
    const aEnd = liInner.indexOf('>', aStart);
    if (aEnd === -1) return '';
    const hrefIdx = liInner.indexOf('href="', aStart);
    if (hrefIdx === -1 || hrefIdx > aEnd) { pos = aEnd + 1; continue; }
    const valStart = hrefIdx + 6;
    const valEnd = liInner.indexOf('"', valStart);
    if (valEnd === -1) return '';
    const href = liInner.slice(valStart, valEnd);
    if (href.indexOf(NEEDLE) !== -1) return href;
    pos = aEnd + 1;
  }
  return '';
}

function extractFirstLinkText(liInner) {
  // Find the first <a that has the /ch21/ href (skip non-section anchors).
  const NEEDLE = '/statutes/chapters/ch21/';
  let pos = 0;
  while (pos < liInner.length) {
    const aStart = liInner.indexOf('<a', pos);
    if (aStart === -1) return '';
    const aOpenEnd = liInner.indexOf('>', aStart);
    if (aOpenEnd === -1) return '';
    const aClose = liInner.indexOf('</a>', aOpenEnd);
    if (aClose === -1) return '';
    const openTag = liInner.slice(aStart, aOpenEnd);
    if (openTag.indexOf(NEEDLE) !== -1) {
      return liInner.slice(aOpenEnd + 1, aClose);
    }
    pos = aClose + 4;
  }
  return '';
}

function absoluteSectionUrl(href) {
  if (!href) return '';
  // Reject anything not on ksrevisor.gov / ksrevisor.org / starting with /statutes/
  if (href.startsWith('/statutes/chapters/ch21/')) {
    return KS_HOST + href;
  }
  if (href.startsWith('https://ksrevisor.gov/statutes/chapters/ch21/')) {
    return href;
  }
  if (href.startsWith('https://www.ksrevisor.gov/statutes/chapters/ch21/')) {
    return href;
  }
  if (href.startsWith('http://ksrevisor.gov/statutes/chapters/ch21/')) {
    // Force HTTPS (no-hallucinated-legal-data: source URLs must be HTTPS)
    return 'https://' + href.slice('http://'.length);
  }
  return '';
}

/**
 * Derive the KS article number from sectionNum and href.
 * Prefer href because it's the authoritative "021_054_0001" form; fall back to
 * deriving from sectionNum digits.
 */
function deriveArticleNumber(sectionNum, href) {
  // href: /statutes/chapters/ch21/021_054_0001.html → article "54"
  const m = /\/021_(\d{3})_/.exec(href);
  if (m) return String(parseInt(m[1], 10)); // strip leading zeros
  // Fallback: derive from sectionNum
  const sm = /^21-(\d+)/.exec(sectionNum);
  if (!sm) return '';
  const digits = sm[1];
  if (digits.length < 3) return '';
  return String(parseInt(digits.slice(0, digits.length - 2), 10));
}

/**
 * Extract the first <span class="stat_caption">...</span> text. Returns ''
 * if absent.
 */
function extractStatCaption(html) {
  const NEEDLE = 'class="stat_caption"';
  const idx = html.indexOf(NEEDLE);
  if (idx === -1) return '';
  // Find the '>' that closes the opening <span> tag
  const openEnd = html.indexOf('>', idx);
  if (openEnd === -1) return '';
  const close = html.indexOf('</span>', openEnd);
  if (close === -1) return '';
  let title = stripHtml(html.slice(openEnd + 1, close)).trim();
  if (title.endsWith('.')) title = title.slice(0, -1).trim();
  return title.slice(0, 480);
}

/**
 * Extract inner content of <div id="print">. Tracks nested <div> opens to
 * find the matching close. Returns '' if absent.
 */
function extractPrintDivInner(html) {
  const NEEDLE = 'id="print"';
  const idx = html.indexOf(NEEDLE);
  if (idx === -1) return '';
  // Walk back to confirm we are inside a <div ...> tag
  const tagStart = html.lastIndexOf('<div', idx);
  if (tagStart === -1) return '';
  const tagEnd = html.indexOf('>', idx);
  if (tagEnd === -1) return '';

  // Find matching </div> by counting nested <div> opens.
  let depth = 1;
  let pos = tagEnd + 1;
  while (pos < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', pos);
    const nextClose = html.indexOf('</div>', pos);
    if (nextClose === -1) return '';
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(tagEnd + 1, nextClose);
      }
      pos = nextClose + 6;
    }
  }
  return '';
}

/**
 * Fallback: gather every <p class="ksa_stat">...</p> body when the print
 * div doesn't enclose the body cleanly.
 */
function extractStatParagraphs(html) {
  const NEEDLE = 'class="ksa_stat"';
  const out = [];
  let pos = 0;
  while (pos < html.length) {
    const idx = html.indexOf(NEEDLE, pos);
    if (idx === -1) break;
    const tagStart = html.lastIndexOf('<p', idx);
    if (tagStart === -1) break;
    const tagEnd = html.indexOf('>', idx);
    if (tagEnd === -1) break;
    const close = html.indexOf('</p>', tagEnd);
    if (close === -1) break;
    out.push(html.slice(tagEnd + 1, close));
    pos = close + 4;
  }
  return out.join(' ');
}

/**
 * After stripHtml on the print-div inner, the leading text echoes the section
 * heading (e.g. "21-5401. Capital murder. (a) Capital murder is the: ..."). We
 * drop everything up to and including that prefix when present.
 */
function stripLeadingHeading(text, sectionNum, titleText) {
  if (!text) return '';
  const prefix = sectionNum + '.';
  const idx = text.indexOf(prefix);
  if (idx === -1 || idx > 50) return text;  // not a heading echo — keep
  let after = text.slice(idx + prefix.length).trimStart();
  // Optional title echo
  if (titleText && after.startsWith(titleText)) {
    after = after.slice(titleText.length).trimStart();
    if (after.startsWith('.')) after = after.slice(1).trimStart();
  }
  return after;
}

/**
 * Strip footer artifacts that survived stripHtml — Print/Previous/Next labels,
 * "Source or Prior Law:" trailers, etc. Mirrors ar-xml.mjs.stripBodyContent
 * shape but tuned for KS surface.
 */
function stripFooterArtifacts(text) {
  if (!text) return '';
  let out = text;
  const cuts = [
    'Print Version',
    'Previous Section',
    'Next Section',
    'Back to Top',
  ];
  for (const phrase of cuts) {
    const idx = out.indexOf(phrase);
    if (idx !== -1) out = out.slice(0, idx);
  }
  return out.trim();
}
