// HTML parsing helpers for Ohio Revised Code (codes.ohio.gov) section pages.
// Pure in-memory string processing — no file I/O. Mirrors fl-html.mjs +
// cornell-html.mjs semantics for hash-integrity (tags-first / decode-second
// / second-pass strip / drop C0+DEL+surrogates).

/** Detect "page not found" / non-existent section. */
export function isSectionNotFound(html) {
  if (!html) return true;
  if (html.length < 500) return true;
  // OH 404 returns 200 OK with "not found" banner + no laws-body container.
  if (html.toLowerCase().indexOf('not found') >= 0 && html.indexOf('laws-body') < 0) return true;
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

/** Discover section numbers from a chapter page. Filters to chapter-prefix
 *  sections only (chapter pages cite cross-chapter references). */
export function extractSectionNumbers(html, chapter) {
  if (!html) return [];
  const seen = new Set();
  // OH section URL pattern: /ohio-revised-code/section-<chapter>.<num>
  const re = /\/ohio-revised-code\/section-(\d+)\.([\w]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] !== String(chapter)) continue;
    if (!/^\d+$/.test(m[2])) continue;
    seen.add(m[1] + '.' + m[2]);
  }
  return [...seen].sort((a, b) => {
    const as = Number.parseInt(a.split('.')[1], 10);
    const bs = Number.parseInt(b.split('.')[1], 10);
    return as - bs;
  });
}

/** Parse an OH section page into {titleText, bodyText, effectiveDate}. */
export function parseSectionPage(html, chapter, section) {
  if (isSectionNotFound(html)) return null;

  // Title from h1: "Section 2925.11 <span>|</span> Possession of controlled substances."
  let titleText = null;
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const h1Text = stripHtml(h1[1]).trim();
    let t = h1Text.replace(/^Section\s+\d+\.\w+\s*[|\-–—]\s*/, '').trim();
    if (!t || t === 'Ohio Revised Code') t = h1Text;
    titleText = t;
  }
  if (!titleText) titleText = 'Section ' + section;

  // Body: scope to <... class="laws-body">...</...>. Container is a div on
  // most sections but we anchor on the class attr to be robust.
  let bodyText = null;
  const bodyStart = html.search(/class="[^"]*laws-body[^"]*"/i);
  if (bodyStart >= 0) {
    const afterOpen = html.indexOf('>', bodyStart) + 1;
    // End boundary: anchor on the OPENING TAG of laws-section-info (W4 fix
    // — `class="laws-section-info` matches inside the tag attr; the body
    // slice should end at the START of that tag, not inside its attribute).
    const candidates = [
      html.indexOf('<div class="laws-section-info', afterOpen),
      html.indexOf('<section class="laws-section-info', afterOpen),
      html.indexOf('</main>', afterOpen),
      html.indexOf('<footer', afterOpen),
    ].filter((n) => n > 0);
    const end = candidates.length ? Math.min(...candidates) : html.length;
    bodyText = stripHtml(html.slice(afterOpen, end));
  } else {
    bodyText = stripHtml(html);
  }

  if (bodyText.length > 20000) bodyText = bodyText.slice(0, 20000).trim();
  if (!bodyText || bodyText.length < 20) return null;

  // SUGG fix from 2026-04-24 review: scope effective-date search to the
  // laws-section-info module (mirrors fl-html.mjs:202-208). Prevents body
  // text like "Effective 1/1/2020 if the defendant ..." from clobbering
  // the row's effective_date with an internal cross-reference.
  let effectiveDate = null;
  let effHaystack = html;
  const infoStart = html.indexOf('class="laws-section-info');
  if (infoStart >= 0) {
    const afterOpen = html.indexOf('>', infoStart) + 1;
    const candidates = [
      html.indexOf('</main>', afterOpen),
      html.indexOf('<footer', afterOpen),
    ].filter((n) => n > 0);
    const end = candidates.length ? Math.min(...candidates) : html.length;
    effHaystack = html.slice(afterOpen, end);
  }
  const em = effHaystack.match(/Effective(?:\s+Date)?:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (em) {
    const mm = String(em[1]).padStart(2, '0');
    const dd = String(em[2]).padStart(2, '0');
    const candidate = em[3] + '-' + mm + '-' + dd;
    const d = new Date(candidate + 'T00:00:00Z');
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === candidate) {
      effectiveDate = candidate;
    }
  }

  return { titleText, bodyText, effectiveDate };
}
