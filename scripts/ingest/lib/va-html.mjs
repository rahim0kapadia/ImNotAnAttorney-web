// HTML parsing helpers for Virginia Code (law.lis.virginia.gov) section pages.
// Mirrors fl-html.mjs / oh-html.mjs / cornell-html.mjs for hash-integrity
// (tags-first / decode-second / second-pass / drop C0+DEL+surrogates).

/** Detect non-existent / error section pages. */
export function isSectionNotFound(html) {
  if (!html) return true;
  if (html.length < 500) return true;
  if (html.toLowerCase().indexOf('not found') >= 0 && html.indexOf('id=\'va_code\'') < 0 && html.indexOf('id="va_code"') < 0) return true;
  // Real VA section pages always have the va_code container.
  if (html.indexOf('va_code') < 0) return true;
  return false;
}

/** Strip HTML tags, decode entities, drop control chars, collapse whitespace. */
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

/** Discover section IDs from a Title-X chapter index page.
 *  Section IDs match `<title>.<dashed-section>` like 18.2-266 or 18.2-266.1.
 *  Filters to the current title prefix. */
export function extractSectionNumbers(html, title, chapter) {
  if (!html) return [];
  const seen = new Set();
  // VA section URLs: /vacode/title<T>/chapter<C>/section<id>/
  const re = /\/vacode\/title(\d+(?:\.\d+)?)\/chapter(\d+(?:\.\d+)?)\/section([\w.-]+?)\//g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = m[1], c = m[2], sec = m[3];
    if (t !== String(title)) continue;
    if (c !== String(chapter)) continue;
    // Section ID must be like "18.2-266" or "18.2-266.1"
    if (!/^\d+(?:\.\d+)?-\d+(?:\.\d+)?$/.test(sec)) continue;
    seen.add(sec);
  }
  return [...seen].sort((a, b) => {
    // Sort by numeric suffix after the dash.
    const as = Number.parseFloat((a.split('-')[1] || '0'));
    const bs = Number.parseFloat((b.split('-')[1] || '0'));
    return as - bs;
  });
}

/** Parse a VA section page into {titleText, bodyText, effectiveDate}. */
export function parseSectionPage(html, section) {
  if (isSectionNotFound(html)) return null;

  // Title from <h2><span id='v0'>§ <number></span>. <Title>.</h2> within
  // the va_code container. Strip the leading "§ <num>. " prefix.
  let titleText = null;
  // Scope to va_code container first.
  const codeStart = html.search(/id=['"]va_code['"]/);
  const workHtml = codeStart >= 0 ? html.slice(codeStart) : html;
  const h2 = workHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (h2) {
    let h2Text = stripHtml(h2[1]).trim();
    // Strip "§ <num>. " prefix (allow §, en-dash for separator).
    const stripPrefixRe = new RegExp('^§\\s*' + section.replace(/[.\\-]/g, '\\$&') + '\\s*[.:\\-]\\s*');
    h2Text = h2Text.replace(stripPrefixRe, '').trim();
    // Drop leading § + any-number form if section-specific strip didn't match
    if (h2Text.startsWith('§ ')) {
      h2Text = h2Text.replace(/^§\s*[\d.\-]+\s*[.:\-]\s*/, '').trim();
    }
    // Drop trailing period.
    h2Text = h2Text.replace(/\s*\.$/, '').trim();
    titleText = h2Text;
  }
  if (!titleText) titleText = 'Section ' + section;

  // Body: scope to <section class='body editable'>...</section> within va_code.
  let bodyText = null;
  const bodyStart = workHtml.search(/<section\b[^>]*class=['"][^'"]*body editable[^'"]*['"]/i);
  if (bodyStart >= 0) {
    const afterOpen = workHtml.indexOf('>', bodyStart) + 1;
    const closeIdx = workHtml.indexOf('</section>', afterOpen);
    const slice = closeIdx > 0 ? workHtml.slice(afterOpen, closeIdx) : workHtml.slice(afterOpen);
    bodyText = stripHtml(slice);
  } else {
    bodyText = stripHtml(workHtml);
  }

  // Trim trailing legislative-history block (years + chapter citations).
  // Pattern: starts with a year like "1989, cc." or "1994, c."
  const histMatch = bodyText.match(/\b(19|20)\d{2},\s+cc?\./);
  if (histMatch && histMatch.index !== undefined && histMatch.index > 50) {
    bodyText = bodyText.slice(0, histMatch.index).trim();
  }

  if (bodyText.length > 20000) bodyText = bodyText.slice(0, 20000).trim();
  if (!bodyText || bodyText.length < 20) return null;

  // Effective date: VA pages don't typically expose a "Effective MM/DD/YYYY"
  // marker in the section body — they use legislative-session metadata. Skip.
  return { titleText, bodyText, effectiveDate: null };
}
