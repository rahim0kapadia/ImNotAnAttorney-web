// HTML parsing helpers for gc.nh.gov RSA statute pages.
//
// Source surface:
//   Title TOC:    https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII.htm
//   Chapter TOC:  https://gc.nh.gov/rsa/html/NHTOC/NHTOC-LXII-{C}.htm
//   Section:      https://gc.nh.gov/rsa/html/LXII/{C}/{C}-{S}.htm
//
// Citation form:  RSA {C}:{S}  (e.g. "RSA 630:1")
// URL form:       dash everywhere ({C}-{S}.htm)
// Letter chapters: 632-A, 639-A, 644-A, 646-A, 649-A, 649-B, 650-A/B/C, 651-A..F
//
// Robots:  User-agent: * / Crawl-Delay: 11 (gc.nh.gov, verified 2026-05-02)
//   No path disallows for *. AhrefsBot fully disallowed.
//
// Plan: docs/plans/2026-05-02-nh-titlelxii-design.md
//
// Page structure (verified 2026-05-02):
//   Active section page:
//     <html><head><title>Section 630:1 Capital Murder.</title></head>
//     <body>
//       <center><h1>TITLE LXII<br>CRIMINAL CODE</h1></center>
//       <center><h2>CHAPTER 630<br>HOMICIDE</h2></center>
//       <center><h3>Section 630:1</h3></center>
//       &nbsp;&nbsp;&nbsp;<b> 630:1 Capital Murder. &#150;</b>
//       <codesect>...body text with <br>...</codesect>
//       <sourcenote><p><b>Source.</b> 1971, 518:1. ... eff. <date>.</p></sourcenote>
//     </body></html>
//
//   Repealed section page:
//     Same shell, but the <b> heading reads:
//     <b> 630:5-a [Repealed, 1985, 351:5, eff. ...].</b>
//     and there is no <codesect> body.
//
// Pure in-memory string processing — no file I/O.

export const NH_HOST = 'gc.nh.gov';
export const NH_BASE_URL = `https://${NH_HOST}`;
export const NH_TITLE = 'LXII';

// ── URL builders ─────────────────────────────────────────────────────────────

export function buildChapterUrl(chapter) {
  return `${NH_BASE_URL}/rsa/html/NHTOC/NHTOC-${NH_TITLE}-${chapter}.htm`;
}

export function buildNHSourceUrl(chapter, section) {
  return `${NH_BASE_URL}/rsa/html/${NH_TITLE}/${chapter}/${chapter}-${section}.htm`;
}

/**
 * Canonical RSA section id for the `section` DB column.
 * Citation form is colon-separated: "630:1", "632-A:2", "651-A:24".
 */
export function canonicalSectionId(chapter, sec) {
  return `${chapter}:${sec}`;
}

// ── Chapter discovery ────────────────────────────────────────────────────────

export function discoverChapterTokens(titleTocHtml) {
  if (!titleTocHtml || typeof titleTocHtml !== 'string') return [];
  const seen = new Set();
  const out = [];
  const rx = /href\s*=\s*"NHTOC-LXII-([0-9]+(?:-[A-Z])?)\.htm"/gi;
  let m;
  while ((m = rx.exec(titleTocHtml)) !== null) {
    const tok = m[1].toUpperCase();
    if (seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

/**
 * @typedef {Object} NHSectionDescriptor
 * @property {string} chapter
 * @property {string} section    URL-form sub-id (e.g. "1", "1-a")
 * @property {string} sectionId  citation form ("630:1")
 * @property {string} url
 */

export function discoverSections(chapterTocHtml, chapter) {
  if (!chapterTocHtml || typeof chapterTocHtml !== 'string') return [];
  const out = [];
  const seen = new Set();
  const escaped = chapter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(
    `href\\s*=\\s*"\\.\\./${NH_TITLE}/${escaped}/${escaped}-([A-Za-z0-9._-]+)\\.htm"`,
    'gi',
  );
  let m;
  while ((m = rx.exec(chapterTocHtml)) !== null) {
    const sec = m[1];
    if (/^mrg$/i.test(sec)) continue; // skip merged-text link
    const sectionId = canonicalSectionId(chapter, sec);
    if (seen.has(sectionId)) continue;
    seen.add(sectionId);
    out.push({
      chapter,
      section: sec,
      sectionId,
      url: buildNHSourceUrl(chapter, sec),
    });
  }
  return out;
}

// ── HTML utilities ───────────────────────────────────────────────────────────

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
    .replace(/&#150;|&#x96;/gi, '-')
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
  return s
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}

// ── Section parser ───────────────────────────────────────────────────────────

function isRepealedHeading(headingBoldText) {
  if (!headingBoldText) return false;
  // Two heading shapes seen in the wild:
  //   "[Repealed, 1985, 351:5, eff. ...]"   (bracketed inline form)
  //   "Repealed by 1973, 370:39, eff. ..."  (header-line form, codesect empty)
  if (/\[\s*Repealed\b/i.test(headingBoldText)) return true;
  if (/\bRepealed\s+by\b/i.test(headingBoldText)) return true;
  return false;
}

function headingMatchesSection(headingBoldText, expectedRsaCite) {
  if (!headingBoldText || !expectedRsaCite) return false;
  const m = headingBoldText.match(/(\d+(?:-[A-Z])?:[A-Za-z0-9._-]+)/);
  if (!m) return false;
  return m[1].toUpperCase() === expectedRsaCite.toUpperCase();
}

/**
 * Parse a single gc.nh.gov section page.
 *
 * Returns null when the page is too short, missing the heading, repealed,
 * or doesn't match the expected section number.
 *
 * @param {string} html full page HTML
 * @param {string} expectedRsaCite citation form, e.g. "630:1"
 * @returns {{ titleText: string, bodyText: string, effectiveDate: string|null }|null}
 */
export function parseSection(html, expectedRsaCite) {
  if (!html || typeof html !== 'string') return null;
  if (html.length < 200) return null;

  // Use \b word boundary to avoid matching <body>, <br>, <blockquote>, etc.
  // The heading we want is the first standalone <b> ... </b> block on the page.
  const headingMatch = html.match(/<b\s*>([\s\S]*?)<\/b>/i);
  if (!headingMatch) return null;
  const headingRaw = headingMatch[1];
  const headingText = stripHtml(headingRaw).replace(/\s+/g, ' ').trim();

  if (isRepealedHeading(headingText)) return null;
  if (!headingMatchesSection(headingText, expectedRsaCite)) return null;

  const titleText = headingText
    .replace(/^\s*\d+(?:-[A-Z])?:[A-Za-z0-9._-]+\s*/i, '')
    .replace(/\s*[-–—]\s*$/, '')
    .replace(/\.\s*$/, '')
    .trim();

  let bodyHtml = '';
  const codesectMatch = html.match(/<codesect\b[^>]*>([\s\S]*?)<\/codesect>/i);
  if (codesectMatch) {
    bodyHtml = codesectMatch[1];
  } else {
    const headEnd = html.indexOf('</b>', headingMatch.index);
    const srcStart = html.search(/<sourcenote\b/i);
    if (headEnd > 0 && srcStart > headEnd) {
      bodyHtml = html.slice(headEnd + '</b>'.length, srcStart);
    } else if (headEnd > 0) {
      bodyHtml = html.slice(headEnd + '</b>'.length);
    }
  }

  const bodyText = stripHtml(bodyHtml);
  if (!bodyText || bodyText.length < 12) return null;

  let effectiveDate = null;
  const sourceMatch = html.match(/<sourcenote\b[^>]*>([\s\S]*?)<\/sourcenote>/i);
  if (sourceMatch) {
    const sourceText = stripHtml(sourceMatch[1]);
    const effRx = /eff\.\s+([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}-\d{1,2}-\d{2,4})/gi;
    let lastMatch;
    let mm;
    while ((mm = effRx.exec(sourceText)) !== null) lastMatch = mm[1];
    if (lastMatch) effectiveDate = normalizeEffectiveDate(lastMatch);
  }

  return {
    titleText: titleText || `Section ${expectedRsaCite}`,
    bodyText,
    effectiveDate,
  };
}

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
};

export function normalizeEffectiveDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  let m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase().slice(0, 3)];
    if (!mon) return null;
    return `${m[3]}-${mon}-${m[2].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (m) {
    let yr = m[3];
    if (yr.length === 2) yr = `20${yr}`;
    return `${yr}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}
