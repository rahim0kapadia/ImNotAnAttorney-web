// HTML parsing helpers for app.leg.wa.gov RCW (Revised Code of Washington) pages.
//
// Source surface: https://app.leg.wa.gov/RCW/default.aspx?cite=<title>.<chapter>[.<section>]
// ASP.NET WebForms backend; fully URL-addressable (no postback required for
// chapter or section navigation per coverage doc gotcha note).
//
// Robots: 404 at /robots.txt — no published policy. Use 2.0s defensive crawl
// delay per WA-statutes openstates-team norms (sibling state-leg sites).
//
// Verified URLs (probed 2026-05-02):
//   https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32        — chapter index
//   https://app.leg.wa.gov/RCW/default.aspx?cite=9A.32.030    — section (Murder 1)
//   https://app.leg.wa.gov/RCW/default.aspx?cite=46.61.502    — DUI section
//   https://app.leg.wa.gov/RCW/default.aspx?cite=46.61.5249   — decimal section
//
// Page structure (verified 2026-05-02):
//   Chapter index:
//     <h1>Chapter NN.NN RCW</h1>
//     <h3 class="list-heading">Sections</h3>
//     <table>...
//       <a href="http://app.leg.wa.gov/RCW/default.aspx?cite=NN.NN.NNN">NN.NN.NNN</a>
//       (chapter-index links use http://; rewrite to https before fetch)
//
//   Section page:
//     <h1>RCW  NN.NN.NNN</h1>                       — citation (in title-block)
//     <h2>Title text.</h2>                          — section caption
//     <div id='contentWrapper' class='section-page'>
//       <div>...body paragraphs as <div style="text-indent:...">...</div></div>
//       <div>[ <a>1990 c 200 s 1</a>; ... ]</div>   — session law history footer
//       <div><h3>Notes:</h3></div>                  — optional notes section
//       <div>...effective date / severability notes...</div>
//     </div>
//
// Pure in-memory string processing — no file I/O, no DOM library.

export const WA_BASE_URL = 'https://app.leg.wa.gov';
export const WA_HOST = 'app.leg.wa.gov';

// ── In-scope chapters (per coverage doc, includes Round-1 additions) ────────
// Each entry: { titleNum, chapterNum, label }
// Title 9A = Washington Criminal Code (1976 modernization)
// Title 9 = Crimes and Punishments (legacy, 9.41 firearms remains here)
// Title 46 = Motor Vehicles (46.61 = rules of the road, includes DUI)
// Title 69 = Food, Drugs, Cosmetics (69.50 = Uniform Controlled Substances Act)
export const WA_CHAPTERS = [
  { titleNum: '9A', chapterNum: '9A.32', label: 'Homicide' },
  { titleNum: '9A', chapterNum: '9A.36', label: 'Assault and other crimes involving physical harm' },
  { titleNum: '9A', chapterNum: '9A.40', label: 'Kidnapping, unlawful imprisonment, custodial interference' },
  { titleNum: '9A', chapterNum: '9A.42', label: 'Criminal mistreatment / abandonment of dependent person' },
  { titleNum: '9A', chapterNum: '9A.44', label: 'Sex offenses' },
  { titleNum: '9A', chapterNum: '9A.46', label: 'Harassment / Stalking' },
  { titleNum: '9A', chapterNum: '9A.52', label: 'Burglary and trespass' },
  { titleNum: '9A', chapterNum: '9A.56', label: 'Theft and robbery' },
  { titleNum: '9A', chapterNum: '9A.60', label: 'Fraud (forgery, criminal impersonation, identity theft)' },
  { titleNum: '9',  chapterNum: '9.41',  label: 'Firearms and dangerous weapons' },
  { titleNum: '46', chapterNum: '46.61', label: 'Rules of the road (incl. DUI)' },
  { titleNum: '69', chapterNum: '69.50', label: 'Uniform Controlled Substances Act' },
];

// ── URL builders ─────────────────────────────────────────────────────────────

/**
 * Build a chapter-index URL.
 * @param {string} chapterNum  e.g. "9A.32" or "46.61"
 * @returns {string} full HTTPS URL
 */
export function buildChapterUrl(chapterNum) {
  return `${WA_BASE_URL}/RCW/default.aspx?cite=${chapterNum}`;
}

/**
 * Build a section URL.
 * @param {string} sectionCite  e.g. "9A.32.030" or "46.61.5249"
 * @returns {string} full HTTPS URL
 */
export function buildSectionUrl(sectionCite) {
  return `${WA_BASE_URL}/RCW/default.aspx?cite=${sectionCite}`;
}

// ── Scheme rewrite guard ─────────────────────────────────────────────────────

/**
 * Chapter-index links surface as http://app.leg.wa.gov/... in HTML output.
 * Rewrite to HTTPS, but ONLY if the host is exactly app.leg.wa.gov (defends
 * against http://app.leg.wa.gov.attacker.com/... smuggling per coverage doc
 * Round-1 SEC-WARN). Returns null for any non-WA host.
 *
 * @param {string} url
 * @returns {string|null}
 */
export function rewriteHttpToHttpsIfWa(url) {
  if (!url || typeof url !== 'string') return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.hostname.toLowerCase() !== WA_HOST) return null;
  u.protocol = 'https:';
  return u.toString();
}

// ── HTML entity decoder (mirrors il-html.mjs decodeEntities) ─────────────────

export function decodeEntities(s) {
  if (s == null) return '';
  return String(s)
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

// ── Strip HTML ───────────────────────────────────────────────────────────────

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
  s = decodeEntities(s);
  s = s.split('').filter((ch) => {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13) return true;
    if (c < 32) return false;
    if (c === 127) return false;
    return true;
  }).join('');
  return s.split(/\s+/).filter(Boolean).join(' ').trim();
}

// ── Repealed-section detection ──────────────────────────────────────────────

/**
 * WA returns a 200 page even for repealed/decodified sections, with body that
 * contains "Repealed" or "Decodified" or "Recodified" near the top + minimal
 * substantive content. Detect to skip cleanly.
 *
 * @param {string} html
 * @returns {boolean}
 */
export function isRepealedOrDecodified(html) {
  if (!html) return false;
  const wrapStart = html.indexOf("id='contentWrapper'");
  if (wrapStart < 0) return false;
  const wrapEnd = html.indexOf('ContentPlaceHolder1_pnlExpanded', wrapStart);
  const slice = wrapEnd > wrapStart
    ? html.substring(wrapStart, wrapEnd)
    : html.substring(wrapStart, wrapStart + 4000);
  const text = stripHtml(slice).toLowerCase();
  if (text.length < 80 && /repealed|decodified|recodified|reserved/i.test(text)) return true;
  const head = text.slice(0, 200);
  if (/^\s*(repealed|decodified|recodified|reserved)/i.test(head)) return true;
  return false;
}

// ── Section-not-found detection (true 404 / wrong page shape) ───────────────

/**
 * @param {string} html
 * @returns {boolean}
 */
export function isSectionNotFound(html) {
  if (!html || html.length < 1000) return true;
  if (!/<h1[^>]*>[\s\S]*?RCW\s+[0-9]+[A-Z]?\.[0-9]+\.[\w.]+/i.test(html)) return true;
  if (!html.includes("id='contentWrapper'")) return true;
  return false;
}

// ── Chapter index: discover section URLs ────────────────────────────────────

/**
 * Walk a chapter-index HTML page and return all section URLs.
 * Section links appear as <a href="http://app.leg.wa.gov/RCW/default.aspx?cite=NN.NN.NNN">.
 *
 * @param {string} html  chapter-index HTML
 * @param {string} chapterNum  e.g. "9A.32"
 * @returns {string[]} unique section URLs (HTTPS, deduped, in document order)
 */
export function discoverSectionUrls(html, chapterNum) {
  if (!html) return [];
  const escapedChapter = chapterNum.replace(/\./g, '\\.');
  const rx = new RegExp(`href=['"]([^'"]*?cite=${escapedChapter}\\.[\\w.]+[^'"]*?)['"]`, 'gi');
  const seen = new Set();
  const urls = [];
  let m;
  while ((m = rx.exec(html)) !== null) {
    const raw = decodeEntities(m[1]);
    let u;
    try {
      u = new URL(raw, WA_BASE_URL);
    } catch {
      continue;
    }
    // Verify host is WA after URL parse (defends against host smuggling)
    if (u.hostname.toLowerCase() !== WA_HOST) continue;
    const cite = u.searchParams.get('cite');
    if (!cite) continue;
    if (!new RegExp(`^${escapedChapter}\\.[\\w.]+$`).test(cite)) continue;
    if (seen.has(cite)) continue;
    seen.add(cite);
    urls.push(buildSectionUrl(cite));
  }
  return urls;
}

// ── Section-cite extractor from URL ─────────────────────────────────────────

/**
 * Pull the cite= param from a section URL.
 * @param {string} sectionUrl
 * @returns {string|null} e.g. "9A.32.030"
 */
export function sectionCiteFromUrl(sectionUrl) {
  try {
    const u = new URL(sectionUrl);
    const cite = u.searchParams.get('cite');
    if (!cite) return null;
    if (!/^[0-9]+[A-Z]?\.[0-9]+\.[\w.]+$/i.test(cite)) return null;
    return cite;
  } catch {
    return null;
  }
}

/**
 * Build canonical section DB id (used for `section` column).
 * Format: "<chapterNum>.<sectionId>" — same as the WA cite, e.g. "9A.32.030".
 * Stored verbatim because WA citations are already globally unique.
 * @param {string} sectionCite
 * @returns {string}
 */
export function buildSectionDbId(sectionCite) {
  return sectionCite;
}

// ── Section parser ──────────────────────────────────────────────────────────

/**
 * Parse a WA RCW section HTML page.
 *
 * Page structure (verified 2026-05-02):
 *   <h1>RCW  9A.32.030</h1>                  ← citation in title-block
 *   <h2>Murder in the first degree.</h2>     ← section caption (title)
 *   <div id='contentWrapper' class='section-page'>
 *     <div><div>...body paragraphs...</div></div>
 *     <div>[ <a>1990 c 200 s 1</a>; ... ]</div>   ← session law history
 *     <div><h3>Notes:</h3></div>                  ← optional
 *     <div>...notes content...</div>
 *   </div>
 *
 * @param {string} html  Full page HTML
 * @param {{ sectionCite: string, sectionUrl: string }} ctx
 * @returns {{ titleText: string, bodyText: string, effectiveDate: string|null }|null}
 */
export function parseSection(html, ctx) {
  if (isSectionNotFound(html)) return null;
  if (isRepealedOrDecodified(html)) return null;

  // ---- Title (H2 caption, may contain CaptionsTitles field comment) ----
  let titleText = '';
  const captionRx = /<!--\s*field:\s*CaptionsTitles\s*-->([\s\S]*?)<!--/i;
  const cMatch = captionRx.exec(html);
  if (cMatch) {
    titleText = stripHtml(cMatch[1]).replace(/\.\s*$/, '').trim();
  }
  if (!titleText) {
    const h2Rx = /<h2[^>]*>([\s\S]*?)<\/h2>/i;
    const h2Match = h2Rx.exec(html);
    if (h2Match) titleText = stripHtml(h2Match[1]).replace(/\.\s*$/, '').trim();
  }

  // ---- Body container (contentWrapper section-page div) ----
  // indexOf points at the attribute; advance past the opening '>' of the <div ...>.
  const wrapAttrIdx = html.indexOf("id='contentWrapper'");
  if (wrapAttrIdx < 0) return null;
  const openCloseIdx = html.indexOf('>', wrapAttrIdx);
  if (openCloseIdx < 0) return null;
  const wrapStart = openCloseIdx + 1;
  // Slice from contentWrapper open through ContentPlaceHolder1_pnlExpanded
  let wrapEnd = html.indexOf('ContentPlaceHolder1_pnlExpanded', wrapStart);
  if (wrapEnd < 0) wrapEnd = wrapStart + 30000;
  const wrapHtml = html.substring(wrapStart, wrapEnd);

  // ---- Effective date: "eff. M-D-YY" or "eff. M/D/YYYY" pattern ----
  let effectiveDate = null;
  const effRx = /eff\.?\s+(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/i;
  const effMatch = effRx.exec(wrapHtml);
  if (effMatch) {
    const mo = effMatch[1].padStart(2, '0');
    const dy = effMatch[2].padStart(2, '0');
    let yr = effMatch[3];
    if (yr.length === 2) {
      const yi = parseInt(yr, 10);
      yr = yi < 50 ? `20${yr}` : `19${yr}`;
    }
    effectiveDate = `${yr}-${mo}-${dy}`;
  }

  // ---- Body: strip session-law footer + Notes section before stripping HTML ----
  let bodyHtml = wrapHtml;
  // Drop the bracketed [ ... ] session-law footer onwards
  const footerRx = /<div[^>]*>\s*\[[\s\S]*?\]\s*<\/div>/i;
  const footerMatch = footerRx.exec(bodyHtml);
  if (footerMatch) {
    bodyHtml = bodyHtml.substring(0, footerMatch.index);
  }
  // Drop <h3>Notes:</h3> section if it's before the footer (defensive)
  const notesIdx = bodyHtml.search(/<h3[^>]*>\s*Notes\s*:?\s*<\/h3>/i);
  if (notesIdx > 0) {
    bodyHtml = bodyHtml.substring(0, notesIdx);
  }

  let bodyText = stripHtml(bodyHtml);
  // Slicing started mid-attribute — strip leading "section-page'>" or class-name junk.
  bodyText = bodyText.replace(/^[\s'"=]+/, '').trim();
  bodyText = bodyText.replace(/^section-page'?>?\s*/, '').trim();
  // After the open tag the next visible content is the (1) marker for most
  // statutes; for some it's plain prose. Drop any leading lone class-name
  // remnants (no parens, no period, no spaces beyond a couple words).
  // Conservative: only strip if first char is not a paren or letter that starts a word.
  bodyText = bodyText.trim();

  if (!bodyText || bodyText.length < 12) return null;

  const usedTitle = titleText || `Section ${ctx?.sectionCite || ''}`.trim();

  return {
    titleText: usedTitle,
    bodyText,
    effectiveDate,
  };
}
