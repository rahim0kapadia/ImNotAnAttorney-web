// HTML parsing helpers for FL Online Sunshine pages.
// Pure in-memory string processing — no file I/O in this module, so regex
// replaces are safe (not "regex on file contents"). Callers fetch HTML via
// network and pass it in as a string.

/** Detect "Statute does not exist" 404-as-200 error. */
export function isSectionNotFound(html) {
  if (!html) return true;
  // Real FL section pages always exceed 200 chars of HTML. Anything shorter
  // is a thin/error page or a truncated response.
  if (html.length < 200) return true;
  if (html.indexOf('Statute does not exist') >= 0) return true;
  if (html.indexOf('The Statute you requested does not exist') >= 0) return true;
  return false;
}

/** Strip HTML tags, decode common entities, collapse whitespace.
 *
 * Order matters: strip tags + comments + scripts FIRST, then decode entities
 * LAST, then re-strip any residual brackets. If we decoded entities first,
 * a malicious payload like `&#60;script&#62;alert(1)&#60;/script&#62;` would
 * re-materialize as `<script>` tags that downstream HTML renderers might
 * execute (SEC-W3 from 2026-04-24 audit). Also drops control characters
 * (< 0x20 except \t \n) and surrogate halves so that csvEscape's NUL-strip
 * doesn't later silently diverge from the hashed input (SEC-W4).
 */
export function stripHtml(html) {
  if (!html) return '';
  let s = html;
  // Strip script / style blocks.
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  // Drop HTML comments.
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // Replace breaks/paragraphs with newlines to preserve structure.
  s = s.replace(/<br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n\n');
  s = s.replace(/<\/div>/gi, '\n');
  // Strip all tags.
  s = s.replace(/<[^>]+>/g, ' ');
  // Decode entities.
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      if (!Number.isInteger(code) || code < 0 || code > 0x10FFFF) return '';
      // Drop C0 controls (except \t \n \r), DEL, and UTF-16 surrogate halves.
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
  // Second-pass tag strip — catches any tags materialized from decoded entities.
  s = s.replace(/<[^>]+>/g, ' ');
  // Final guardrail: drop any control bytes that survived.
  s = s.split("").filter(ch => { const c = ch.charCodeAt(0); if (c === 9 || c === 10 || c === 13) return true; if (c < 32) return false; if (c === 127) return false; return true; }).join("");
  // Collapse whitespace.
  return s.split(/\s+/).filter(Boolean).join(' ').trim();
}

/** Extract section numbers from a chapter contents-index or chapter page.
 *
 * Scopes discovery to URL patterns matching `/Sections/<padded>.<sec>.html`
 * (the canonical FL Online Sunshine section-link shape). Prior version
 * regex-matched any `316.NNN` in the raw HTML, which over-matched body-
 * text cross-references and historical citations — producing 404-noise
 * against FL infrastructure (W13 from 2026-04-24 code review).
 */
export function extractSectionNumbers(html, chapter) {
  if (!html) return [];
  const seen = new Set();
  const pad = String(chapter).padStart(4, '0');
  // Anchor to the canonical section URL shape that FL uses on index pages.
  const urlRx = new RegExp('/Sections/' + pad + '\\.([\\w]+)\\.html', 'gi');
  let m;
  while ((m = urlRx.exec(html)) !== null) {
    // m[1] is the part after the chapter number. Only accept numeric
    // section strings (reject e.g. ContentsIndex or other chrome).
    if (!/^\d+$/.test(m[1])) continue;
    seen.add(chapter + '.' + m[1]);
  }
  // Fallback: if no anchor-scoped matches, widen to free-form chapter.sec
  // pattern on the page (used by the legacy fixture-based tests).
  if (seen.size === 0) {
    const sectionRx = new RegExp('\\b' + chapter + '\\.(\\d+)\\b', 'g');
    let mm;
    while ((mm = sectionRx.exec(html)) !== null) {
      seen.add(chapter + '.' + mm[1]);
    }
  }
  return [...seen].sort((a, b) => {
    const as = Number.parseInt(a.split('.')[1], 10);
    const bs = Number.parseInt(b.split('.')[1], 10);
    return as - bs;
  });
}

/** Parse a section page into {titleText, bodyText, effectiveDate}. */
export function parseSectionPage(html, chapter, section) {
  if (isSectionNotFound(html)) return null;

  // Real FL Online Sunshine pages wrap the statute in:
  //   <div id="statutes"> ... <div class="Section">
  //     <span class="SectionNumber">893.13 </span>
  //     <span class="Catchline">
  //       <span class="CatchlineText">Prohibited acts; penalties.</span>
  //       <span class="EmDash">—</span>
  //     </span>
  //     <span class="SectionBody"> ... body HTML ... </span>
  //   </div>
  // Fall back to the legacy structure (outer <title>, plain body) so tests
  // with simpler fixtures still pass.
  //
  // Locator strategy: find the statute container, then the inner
  // CatchlineText + SectionBody. If neither is present, treat the page as
  // the legacy layout and fall back to <title> + stripped body.

  const statutesStart = html.indexOf('<div id="statutes"');
  const workHtml = statutesStart >= 0 ? html.slice(statutesStart) : html;

  // Title: prefer CatchlineText (the short caption) — it's the semantic
  // "short title" for the section. Fall back to <title>.
  let titleText = null;
  const catchMatch = workHtml.match(/<span\b[^>]*class="[^"]*CatchlineText[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  if (catchMatch) {
    titleText = stripHtml(catchMatch[1]);
  }
  if (!titleText) {
    const titleMatch = html.match(/<title>\s*([^<]*?)\s*<\/title>/i);
    if (titleMatch) {
      titleText = titleMatch[1].trim();
      // Strip leading "F.S. 893.13" or "893.13" if present.
      titleText = titleText.replace(/^F\.S\.\s+/i, '').trim();
      const leadingRx = new RegExp('^' + chapter + '\\.\\d+\\s*[—\\-–]?\\s*');
      titleText = titleText.replace(leadingRx, '').trim();
      titleText = titleText.replace(/\s*[-–—]\s*Florida\s+Statutes?\s*$/i, '').trim();
      // Strip generic "Online Sunshine" page-chrome titles that don't carry
      // section info (the outer page's <title> on real FL pages is generic).
      if (/Online\s+Sunshine/i.test(titleText) || /Statutes\s*&\s*Constitution/i.test(titleText)) {
        titleText = null;
      }
    }
  }
  if (!titleText) titleText = 'Section ' + section;

  // Body: prefer SectionBody span. Real FL pages have NESTED divs/spans
  // inside SectionBody (Subsection > Paragraph > SubParagraph > Text), so a
  // match bounded by the FIRST </span></div> terminates after the first
  // sentence. The correct boundary is the inner document's </body> — which
  // FL emits after the outermost </div></span>. Use </body> as the anchor;
  // fall back to the whole workHtml if missing (W6 fix).
  let bodyText = null;
  const bodyStart = workHtml.search(/<span\b[^>]*class="[^"]*SectionBody[^"]*"[^>]*>/i);
  if (bodyStart >= 0) {
    // Slice from end of opening tag.
    const afterOpen = workHtml.indexOf('>', bodyStart) + 1;
    // End boundary: next </body> (inner document closer) or end-of-string.
    const closeIdx = workHtml.toLowerCase().indexOf('</body>', afterOpen);
    const slice = closeIdx > 0 ? workHtml.slice(afterOpen, closeIdx) : workHtml.slice(afterOpen);
    bodyText = stripHtml(slice);
  } else {
    bodyText = stripHtml(workHtml);
  }

  // Trim history notes (bloat + don't help generator). Handle both em-dash
  // (modern FL pages) and ASCII dash / no-dash (older pages).
  const historyMatch = bodyText.match(/History\.\s*[—–-]/);
  if (historyMatch && historyMatch.index > 20) {
    bodyText = bodyText.slice(0, historyMatch.index).trim();
  }

  // Drop leading chrome by locating the section marker (only if we didn't
  // already scope to SectionBody, where the section number is absent).
  if (bodyStart < 0) {
    const sectionIdx = bodyText.indexOf(section);
    if (sectionIdx > 0 && sectionIdx < bodyText.length / 3) {
      bodyText = bodyText.slice(sectionIdx).trim();
    }
  }

  // Cap to 20KB.
  if (bodyText.length > 20000) bodyText = bodyText.slice(0, 20000).trim();
  // Defensive-depth: parser returns null if body is unusable so the caller
  // never builds a row that the downstream Zod gate will just reject.
  if (!bodyText || bodyText.length < 20) return null;

  // Effective date — if we scoped to SectionBody, hunt inside that slice
  // first. Fall back to whole-page only if SectionBody scope is absent.
  // (SUGG effective-date-anchoring from 2026-04-24 review.)
  let effectiveDate = null;
  let effHaystack = workHtml;
  if (bodyStart >= 0) {
    const afterOpen = workHtml.indexOf('>', bodyStart) + 1;
    const closeIdx = workHtml.toLowerCase().indexOf('</body>', afterOpen);
    effHaystack = closeIdx > 0 ? workHtml.slice(afterOpen, closeIdx) : workHtml.slice(afterOpen);
  }
  const em = effHaystack.match(/Effective\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (em) {
    const mm = String(em[1]).padStart(2, '0');
    const dd = String(em[2]).padStart(2, '0');
    const candidate = em[3] + '-' + mm + '-' + dd;
    // Real-date validation: reject 0000-01-01, 2024-02-30, etc.
    const d = new Date(candidate + 'T00:00:00Z');
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === candidate) {
      effectiveDate = candidate;
    }
  }

  return { titleText, bodyText, effectiveDate };
}
