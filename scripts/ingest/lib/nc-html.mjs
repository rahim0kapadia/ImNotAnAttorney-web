// HTML parsing helpers for North Carolina General Statutes
// (www.ncleg.gov/EnactedLegislation/Statutes/HTML/) chapter pages.
//
// IMPORTANT DESIGN CHOICE: ncleg.gov chapter index pages contain the FULL TEXT
// of every section in that chapter (verified 2026-05-02 — Chapter_14.html is
// 1.85MB and contains 1148 §-references with full body text). Per-section URLs
// (GS_<C>-<N>.html) ALSO exist and serve the same content but require N fetches
// per chapter. We parse the chapter index ONCE and store per-section URLs as
// the verification source_urls — gives us verified per-section permalinks
// without N×N fetches.
//
// Cloudflare-fronted, but legitimate static XHTML 1.0 Transitional, utf-8.
// CSS class names are auto-generated hashes (`cs<hex>`) — DO NOT match on
// classnames; anchor on tag + content prefix `&sect;` / `§`.

/** Detect non-existent / error / repealed chapter pages.
 *  Threshold is the §-literal presence; live chapter pages will be ≥10KB,
 *  but synthetic test fixtures may be small — gate on §-literal not size. */
export function isChapterNotFound(html, chapter) {
  if (!html) return true;
  if (html.length < 30) return true;
  const lower = html.toLowerCase();
  if (lower.indexOf('page not found') >= 0) return true;
  if (lower.indexOf('error 404') >= 0) return true;
  // Real NC chapter pages always have at least one §<chapter>- literal.
  const probe = '&sect; ' + chapter + '-';
  if (html.indexOf(probe) < 0 && html.indexOf('§ ' + chapter + '-') < 0) return true;
  return false;
}

// Backward-compat alias for older test code.
export const isSectionNotFound = isChapterNotFound;

/** Detect a repealed-section tombstone in body text. */
export function isRepealed(text) {
  if (!text) return false;
  // Common forms: "Repealed by Session Laws ...", "Repealed by 1973, c. 47, s. 2."
  return /\brepealed\b/i.test(text) && text.length < 400;
}

/** Strip HTML tags, decode entities, drop control chars, collapse whitespace.
 *  Mirrors va-html.mjs / cornell-html.mjs hash-integrity discipline. */
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
    .replace(/&sect;/gi, '§')
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
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.split('').filter((ch) => {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13) return true;
    if (c < 32) return false;
    if (c === 127) return false;
    return true;
  }).join('');
  return s.split(/\s+/).filter(Boolean).join(' ').trim();
}

/** Discover section IDs from a chapter index page by scanning §-literal anchors.
 *  Returns sorted array of section ids (string), e.g. ['1', '2.1', '17', '18.1A'].
 *  Filters to current chapter prefix only.
 *
 *  NOTE: ncleg chapter pages embed every section inline; there are no outbound
 *  hrefs to per-section pages. Discovery = scan for `&sect; <chapter>-<sec>.`
 *  literals.
 */
export function extractSectionNumbers(html, chapter) {
  if (!html) return [];
  const seen = new Set();
  // Match either &sect; or § (after entity decode), followed by chapter-section.
  // Section may have decimal/letter suffix: 14-17, 14-18.1, 14-18.1A, 20-138.1
  const target = String(chapter);
  // Escape lettered chapter (15A, 74C, 74E)
  const chEsc = target.replace(/[.\\]/g, (m) => '\\' + m);
  // Allow either &sect; or literal § (rare in raw HTML but defensive)
  const re = new RegExp(
    '(?:&sect;|§)\\s*' + chEsc + '-(\\d+(?:\\.\\d+[A-Z]?)?)\\b',
    'g',
  );
  let m;
  while ((m = re.exec(html)) !== null) {
    seen.add(m[1]);
  }
  return [...seen].sort((a, b) => {
    const [aBase, aSuf] = a.split('.');
    const [bBase, bSuf] = b.split('.');
    const aN = Number.parseInt(aBase, 10);
    const bN = Number.parseInt(bBase, 10);
    if (aN !== bN) return aN - bN;
    if (aSuf == null && bSuf == null) return 0;
    if (aSuf == null) return -1;
    if (bSuf == null) return 1;
    const aSn = Number.parseInt(aSuf, 10);
    const bSn = Number.parseInt(bSuf, 10);
    if (aSn !== bSn) return aSn - bSn;
    return aSuf.localeCompare(bSuf);
  });
}

/** Parse a single section out of a chapter HTML page.
 *  Returns {titleText, bodyText, repealed} or null if not parseable.
 *
 *  Strategy: locate the `&sect; <chapter>-<section>.` literal in the raw HTML,
 *  then take the slice from that anchor up to the NEXT `&sect; <chapter>-`
 *  literal (or chapter-end). Strip tags + entities → produce title + body.
 */
export function parseSectionFromChapter(chapterHtml, chapter, section) {
  if (!chapterHtml) return null;
  const target = String(chapter);
  // Find the section anchor in raw HTML.
  // Use both encoded (&sect;) and decoded (§) forms.
  const sectionEsc = section.replace(/[.\\]/g, (m) => '\\' + m);
  const chEsc = target.replace(/[.\\]/g, (m) => '\\' + m);
  // Match: &sect; <chapter>-<section>.<SP|nbsp>  OR  § <chapter>-<section>.
  // Lookahead: not followed by another digit (would extend the section number)
  // and not followed by .digit (would be a decimal suffix). A trailing letter
  // is allowed only if section already ends with a digit (e.g. 14-18.1A).
  const anchorRe = new RegExp(
    '(?:&sect;|§)\\s*' + chEsc + '-' + sectionEsc + '(?![0-9])(?!\\.[0-9])(?![A-Z](?=[0-9]))',
    'g',
  );
  const startMatch = anchorRe.exec(chapterHtml);
  if (!startMatch) return null;

  // Find the next §<chapter>- literal AFTER this anchor → that's our slice end.
  const endRe = new RegExp(
    '(?:&sect;|§)\\s*' + chEsc + '-\\d',
    'g',
  );
  endRe.lastIndex = startMatch.index + startMatch[0].length;
  const endMatch = endRe.exec(chapterHtml);
  const sliceEnd = endMatch ? endMatch.index : Math.min(chapterHtml.length, startMatch.index + 50000);
  const rawSlice = chapterHtml.slice(startMatch.index, sliceEnd);

  // Strip to plain text.
  const fullText = stripHtml(rawSlice);
  if (!fullText || fullText.length < 5) return null;

  // The slice begins with "§ <chapter>-<section>.<heading>."  Strip the literal.
  // After stripHtml, "&sect;" → "§" and "&nbsp;" → " ".
  const stripPrefixRe = new RegExp(
    '^§\\s*' + chEsc + '-' + sectionEsc + '\\s*[.:\\-]?\\s*',
    '',
  );
  let after = fullText.replace(stripPrefixRe, '').trim();
  if (!after) return null;

  // Title: first sentence (up to '.') bounded at 200 chars.
  let titleText = '';
  // Look for the first period or end-of-sentence-marker that ends the heading.
  // Heading often ends with a period and is followed by a subsection marker
  // like "(a)" or by body prose.
  const dotIdx = after.indexOf('.');
  if (dotIdx > 0 && dotIdx < 200) {
    titleText = after.slice(0, dotIdx).trim();
    after = after.slice(dotIdx + 1).trim();
  } else {
    titleText = after.slice(0, 80).trim();
  }

  // Body = remainder.
  let bodyText = after;

  // Trim trailing legislative-history block. NC histories often look like:
  // "(1893, c. 281, s. 1; Rev., s. 3271; C.S., s. 4200; 1949, c. 299; 1953, c. 100.)"
  // OR start with year-century + cc/c citation chain.
  const histPatterns = [
    /\(\s*(18|19|20)\d{2}\s*,\s*c\.?/i,        // "(1893, c. 281"
    /\b(18|19|20)\d{2}-\d+,\s*s\.\s*\d+/,      // "1973-528, s. 1"
    /\bSession Laws\s+(18|19|20)\d{2}\b/i,     // "Session Laws 1973, c."
  ];
  let earliestHist = -1;
  for (const re of histPatterns) {
    const hm = bodyText.match(re);
    if (hm && hm.index != null && hm.index > 50) {
      if (earliestHist === -1 || hm.index < earliestHist) earliestHist = hm.index;
    }
  }
  if (earliestHist > 0) bodyText = bodyText.slice(0, earliestHist).trim();

  // Cap body length (defensive).
  if (bodyText.length > 20000) bodyText = bodyText.slice(0, 20000).trim();

  // Repealed-section detection: short body containing "repealed".
  const repealed = isRepealed(bodyText) || isRepealed(titleText);

  // Reject repealed (don't seed tombstones) and too-short bodies.
  if (repealed) return null;
  if (!bodyText || bodyText.length < 20) return null;
  if (!titleText) titleText = 'Section ' + chapter + '-' + section;

  return { titleText, bodyText, repealed: false };
}

/** Backward-compat name for VA-pattern callers (alias to parseSectionFromChapter). */
export function parseSectionPage(html, chapter, section) {
  return parseSectionFromChapter(html, chapter, section);
}
