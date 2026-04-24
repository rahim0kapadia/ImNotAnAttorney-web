// Pure HTML parsing helpers for Cornell LII USC section pages.
// Input: raw HTML string. Output: {titleText, bodyText}.
// No file I/O here — regex replaces on in-memory strings are safe.

/** Strip HTML tags, decode entities, drop control chars, collapse whitespace.
 *  Mirrors fl-html.mjs semantics: tags-first / decode-second / second-pass
 *  strip / drop C0 + DEL + surrogates. */
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
  // Second-pass tag strip catches any tags materialized from entity decode.
  s = s.replace(/<[^>]+>/g, ' ');
  // Drop C0 controls (except tab/LF/CR) + DEL.
  s = s.split('').filter((ch) => {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13) return true;
    if (c < 32) return false;
    if (c === 127) return false;
    return true;
  }).join('');
  return s.split(/\s+/).filter(Boolean).join(' ').trim();
}

/** Detect "page not found" / empty-section pages. Cornell 404s return a
 *  regular 200 with a specific banner. */
export function isSectionNotFound(html) {
  if (!html) return true;
  if (html.length < 500) return true;
  if (html.indexOf('section you requested does not exist') >= 0) return true;
  if (html.indexOf('Page Not Found') >= 0 && html.indexOf('uscode') >= 0 && html.indexOf('<h1') < 0) return true;
  return false;
}

/** Parse a Cornell LII USC section page into {titleText, bodyText}. */
export function parseSectionPage(html, title, section) {
  if (isSectionNotFound(html)) return null;

  // Title: `<h1>18 U.S. Code § 922 - Unlawful acts</h1>`
  // Cornell sometimes renders separator as en-dash (–) or em-dash (—) instead
  // of ASCII hyphen. Handle all three — W2 from 2026-04-24 code review.
  let titleText = null;
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const h1Text = stripHtml(h1[1]).trim();
    let splitIdx = -1;
    let splitLen = 0;
    for (const sep of [' - ', ' – ', ' — ']) {
      const i = h1Text.indexOf(sep);
      if (i > 0 && (splitIdx < 0 || i < splitIdx)) {
        splitIdx = i;
        splitLen = sep.length;
      }
    }
    if (splitIdx > 0) {
      titleText = h1Text.slice(splitIdx + splitLen).trim();
    } else {
      titleText = h1Text;
    }
  }
  if (!titleText) titleText = 'Section ' + section;

  // Body: scope to active tab pane, bounded by next tab or </text> close.
  const tabStart = html.indexOf('<div class="tab-pane active" id="tab_default_1">');
  if (tabStart < 0) return null;
  const afterOpen = html.indexOf('>', tabStart) + 1;

  const tab2 = html.indexOf('id="tab_default_2"', afterOpen);
  const textClose = html.indexOf('</text>', afterOpen);
  const candidates = [tab2, textClose].filter((n) => n > 0);
  const end = candidates.length ? Math.min(...candidates) : html.length;
  const slice = html.slice(afterOpen, end);

  let bodyText = stripHtml(slice);

  // Trim trailing source/amendment note. Cornell renders these as
  // `(Pub. L. N-NN, ..., ... Stat. ...)` at the end of the tab.
  const pubLIdx = bodyText.lastIndexOf('(Pub. L.');
  if (pubLIdx > 0 && pubLIdx > bodyText.length * 0.6) {
    bodyText = bodyText.slice(0, pubLIdx).trim();
  }

  if (bodyText.length > 20000) bodyText = bodyText.slice(0, 20000).trim();
  if (!bodyText || bodyText.length < 20) return null;

  return { titleText, bodyText };
}
