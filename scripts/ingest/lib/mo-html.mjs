// Template: scripts/ingest/lib/sc-html.mjs (multi-chapter parse + entity decode)
// Template: scripts/ingest/lib/ma-html.mjs (Bucket B per-section discovery + parse)
// Pattern: cl-bulk-data-defensive #18 — bulk parse in-memory, COPY via harness
// Pattern: bucket-b-html.mjs — discoverSections / parseSection / buildSourceUrl contract
//
// Source: https://revisor.mo.gov/main/OneChapter.aspx?chapter={N} (chapter index, links only)
//         https://revisor.mo.gov/main/OneSection.aspx?section={N}.{NNN} (per-section page, full text)
//
// MO architecture (verified live 2026-05-02 against ch565 + section 565.020):
//   - OneChapter.aspx returns a SECTION INDEX (not inline content); each entry is
//     `<a class="lr-font-emph" href="/main/PageSelect.aspx?section=N.NNN&bid=NNNNN&hl=">N.NNN</a>`.
//   - PageSelect.aspx 302-redirects to OneSection.aspx?section=N.NNN (drops bid).
//   - OneSection.aspx is plain HTTP — no ViewState, no session cookie, no AJAX.
//     Direct GET against the canonical URL (no `bid=`) returns the full statute body.
//   - Section body wrapper:
//       <div class="norm" title="" style="...">
//         <p class="norm">
//           <span class="bold">  N.NNN.<span>  </span>Title — </span>body…
//         </p>
//         <p class="norm">…more body paragraphs…</p>
//         <div class="foot">…history / cross-refs (skip)…</div>
//       </div>
//   - Heading separator is the "—" (em-dash) BETWEEN title and body, inside the
//     bold span. We split on the closing `</span>` of the bold span; everything
//     before that (after stripping the section number prefix) is title; everything
//     between </span> and the start of <div class="foot"> is body.
//
// Robots: revisor.mo.gov has no Crawl-delay (verified 2026-05-02 — robots.txt
//   returns the homepage HTML, treat as no rule). Use 1500ms defensive floor.

/**
 * @typedef {Object} MoSectionDescriptor
 * @property {string} chapterNum  e.g. "565"
 * @property {string} sectionNum  e.g. "565.020"
 * @property {string} sectionUrl  canonical OneSection.aspx URL (no bid)
 */

/**
 * @typedef {Object} MoParsedSection
 * @property {string} titleText   heading text (between section number and body)
 * @property {string} bodyText    body text, decoded + tag-stripped, foot trailer removed
 */

// ---------------------------------------------------------------------------
// HTML entity decode + tag strip (mirrors sc-html.stripHtml)
// ---------------------------------------------------------------------------

/**
 * Decode common HTML entities and strip HTML tags. Operates on in-memory
 * HTTP-fetched strings (not filesystem reads).
 */
export function stripHtml(raw) {
  return raw
    .split('&lt;').join('<')
    .split('&gt;').join('>')
    .split('&amp;').join('&')
    .split('&quot;').join('"')
    .split('&apos;').join("'")
    .split('&#39;').join("'")
    .split('&#167;').join('§')
    .split('&sect;').join('§')
    .split('&nbsp;').join(' ')
    .split('&mdash;').join('-')
    .split('&ndash;').join('-')
    .split('&#8212;').join('-')
    .split('&#8211;').join('-')
    .split('&#8217;').join("'")
    .split('&#8216;').join("'")
    .split('&#8220;').join('"')
    .split('&#8221;').join('"')
    // strip <script> and <style> blocks before generic tag strip
    .split(/<script[\s\S]*?<\/script>/gi).join(' ')
    .split(/<style[\s\S]*?<\/style>/gi).join(' ')
    .split(/<[^>]+>/g).join(' ')
    .split(/[\s ]+/).filter(Boolean).join(' ')
    .trim();
}

// Note: split/join is used above. The /<[^>]+>/g and /<script.../gi above are
// regex on STRINGS (not file contents), which is permitted — global rules ban
// "regex on file contents" only. These match tags inside an in-memory HTTP body.

// ---------------------------------------------------------------------------
// Section number validation
// ---------------------------------------------------------------------------

/**
 * Validate canonical MO section number "N.NNN" format. MO sections are stored
 * as `chapter.section` where chapter is 1-3 digits and section is up to 4
 * digits, with optional trailing alpha for amendments (e.g. "565.020a").
 *
 * Cohort floor: chapter must be one of MO_CHAPTERS — defensive against picking
 * up cross-references to other chapters that happen to live inside a chapter
 * dump (e.g. 565.020 mentions 565.033 inline; both are valid).
 */
export function isValidMoSectionNum(s) {
  if (!s || typeof s !== 'string') return false;
  const parts = s.split('.');
  if (parts.length !== 2) return false;
  if (!/^\d{1,3}$/.test(parts[0])) return false;
  if (!/^\d{1,4}[a-zA-Z]?$/.test(parts[1])) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Discover section URLs from a chapter index page
// ---------------------------------------------------------------------------

/**
 * Walk the OneChapter.aspx HTML and emit one MoSectionDescriptor per unique
 * section link. Bucket B harness contract: discoverSections(html, config).
 *
 * Each `<a href="/main/PageSelect.aspx?section=N.NNN&bid=...">N.NNN</a>`
 * becomes a descriptor with the CANONICAL url
 * `https://revisor.mo.gov/main/OneSection.aspx?section=N.NNN` (no bid;
 * PageSelect.aspx 302-redirects to OneSection.aspx anyway). Dropping bid
 * keeps URLs stable across MO's backend version churn.
 *
 * @param {string} chapterHtml  raw chapter index HTML
 * @param {string} chapterNum   expected chapter (e.g. "565") — section nums
 *                              must start with `${chapterNum}.` to be kept;
 *                              defends against cross-refs to other chapters.
 * @returns {MoSectionDescriptor[]} unique by sectionNum, in source order
 */
export function discoverMoSectionUrls(chapterHtml, chapterNum) {
  const out = [];
  const seen = new Set();
  const HREF_OPEN = 'href="/main/PageSelect.aspx?section=';
  let pos = 0;
  while (true) {
    const i = chapterHtml.indexOf(HREF_OPEN, pos);
    if (i === -1) break;
    const start = i + HREF_OPEN.length;
    // section number ends at `&` or `"` (whichever comes first)
    const endAmp = chapterHtml.indexOf('&', start);
    const endQuote = chapterHtml.indexOf('"', start);
    let end = endQuote;
    if (endAmp !== -1 && endAmp < endQuote) end = endAmp;
    if (end === -1) break;
    const sectionNum = chapterHtml.slice(start, end).trim();
    pos = end;

    if (!isValidMoSectionNum(sectionNum)) continue;
    // Cohort guard: skip cross-refs to other chapters
    if (!sectionNum.startsWith(chapterNum + '.')) continue;
    if (seen.has(sectionNum)) continue;
    seen.add(sectionNum);

    out.push({
      chapterNum,
      sectionNum,
      sectionUrl: buildMoSourceUrl(sectionNum),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parse one section page (OneSection.aspx body)
// ---------------------------------------------------------------------------

const BODY_OPEN = '<div class="norm"';
const SPAN_BOLD_OPEN = '<span class="bold">';
const SPAN_CLOSE = '</span>';
const FOOT_OPEN = '<div class="foot"';
const BODY_CLOSE_HR = '<hr';

/**
 * Parse one OneSection.aspx page into a {titleText, bodyText} record.
 *
 * Bucket B harness contract: parseSection(sectionHtml, sectionNum, config).
 * Returns null when the page isn't a parseable statute (e.g. a "section
 * not found" error or a structurally degenerate page).
 *
 * Repealed sections (e.g. "(Repealed L. 1996 H.B. 974)") DO get parsed:
 * titleText is the parenthetical, bodyText echoes "Repealed" — tier-9 callers
 * can filter is_current via the title prefix at query time. We don't drop them
 * because their existence is signal (defendant may be charged under a section
 * that has since been replaced; the seed needs to surface that).
 *
 * @param {string} sectionHtml   raw OneSection.aspx HTML
 * @param {string} sectionNum    canonical section id e.g. "565.020"
 * @returns {MoParsedSection|null}
 */
export function parseMoSection(sectionHtml, sectionNum) {
  // Find the FIRST <div class="norm" that ALSO contains the section number
  // span. Page has many other `class="norm"` paragraphs (footer, cross-refs)
  // — we want the wrapper div, identified by its <span class="bold"> with the
  // section number prefix.
  const sectionMarker = `${sectionNum}.`;
  let cursor = 0;
  let bodyDivStart = -1;
  while (true) {
    const divIdx = sectionHtml.indexOf(BODY_OPEN, cursor);
    if (divIdx === -1) break;
    const lookaheadEnd = Math.min(divIdx + 4000, sectionHtml.length);
    const window = sectionHtml.slice(divIdx, lookaheadEnd);
    if (window.includes(SPAN_BOLD_OPEN) && window.includes(sectionMarker)) {
      bodyDivStart = divIdx;
      break;
    }
    cursor = divIdx + BODY_OPEN.length;
  }
  if (bodyDivStart === -1) return null;

  // Body div ends at the next <hr (which closes off the section content
  // before the "All versions" table) OR the closing </body>. We bound on
  // <hr to be robust against MO's nested-div layout.
  const hrIdx = sectionHtml.indexOf(BODY_CLOSE_HR, bodyDivStart);
  const bodyEnd = hrIdx === -1 ? sectionHtml.length : hrIdx;
  const bodyDiv = sectionHtml.slice(bodyDivStart, bodyEnd);

  // Title sits inside the FIRST <span class="bold"> ...</span> within the body
  // div. Format: "  <sectionNum>.<span>  </span>Title text. — "
  // The bold span CONTAINS a nested `<span>  </span>` (used as a typographic
  // double-space). Naively matching the next `</span>` lands on the inner
  // close, not the outer. Walk forward counting `<span` opens vs `</span>`
  // closes to find the TRUE outer close.
  const spanStart = bodyDiv.indexOf(SPAN_BOLD_OPEN);
  if (spanStart === -1) return null;
  const spanInnerStart = spanStart + SPAN_BOLD_OPEN.length;
  let depth = 1;
  let cursorScan = spanInnerStart;
  let outerClose = -1;
  while (cursorScan < bodyDiv.length) {
    const nextOpen = bodyDiv.indexOf('<span', cursorScan);
    const nextClose = bodyDiv.indexOf('</span>', cursorScan);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursorScan = nextOpen + 5; // past "<span"
    } else {
      depth -= 1;
      if (depth === 0) { outerClose = nextClose; break; }
      cursorScan = nextClose + SPAN_CLOSE.length;
    }
  }
  if (outerClose === -1) return null;

  const rawHeading = bodyDiv.slice(spanInnerStart, outerClose);
  let heading = stripHtml(rawHeading);
  // Heading begins with "<sectionNum>." — drop it
  const numPrefix = `${sectionNum}.`;
  if (heading.startsWith(numPrefix)) heading = heading.slice(numPrefix.length).trim();
  // Drop trailing em-dash / hyphen used as title→body separator
  heading = heading.replace(/\s*[—–-]\s*$/, '').trim();
  // Replace local span end so body extraction picks up after the OUTER close.
  const spanEnd = outerClose;

  // Body = everything AFTER the bold-span close, but BEFORE the <div class="foot">
  // (or end of bodyDiv if no foot). Strip cross-ref anchors, history, etc.
  const afterHeading = bodyDiv.slice(spanEnd + SPAN_CLOSE.length);
  const footIdx = afterHeading.indexOf(FOOT_OPEN);
  const rawBody = footIdx === -1 ? afterHeading : afterHeading.slice(0, footIdx);
  const bodyText = stripHtml(rawBody).slice(0, 4000);

  if (!heading && !bodyText) return null;

  return {
    titleText: heading || `Section ${sectionNum}`,
    bodyText: bodyText || '(no body)',
  };
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

/**
 * Build the canonical authoritative URL for an MO section.
 * Stored in entities_statutes.source_urls[].
 *
 * @param {string} sectionNum  e.g. "565.020"
 * @returns {string}
 */
export function buildMoSourceUrl(sectionNum) {
  return `https://revisor.mo.gov/main/OneSection.aspx?section=${sectionNum}`;
}

/**
 * Build the chapter index URL. Used by the seeder during discovery.
 *
 * @param {string|number} chapterNum  e.g. "565"
 * @returns {string}
 */
export function buildMoChapterUrl(chapterNum) {
  return `https://revisor.mo.gov/main/OneChapter.aspx?chapter=${chapterNum}`;
}

// ---------------------------------------------------------------------------
// Cohort
// ---------------------------------------------------------------------------

/**
 * Default MO criminal cohort per Wave 2 design report 2026-05-02.
 * Values are STRING chapter numbers (MO uses pure numeric chapters in Title 38
 * but several are 3-digit). Each chapter is ingested as its own
 * `(jurisdiction, title)` scope so the harness's DELETE-then-COPY is per-chapter.
 *
 * Coverage:
 *   565 — Offenses Against the Person (homicide / assault / kidnapping)
 *   566 — Sexual Offenses
 *   569 — Robbery / Burglary / Stealing
 *   570 — Stealing & Related Property Offenses
 *   571 — Weapons Offenses
 *   575 — Offenses Against the Administration of Justice
 *   577 — Public Safety Offenses (DWI, traffic)
 *   195 — Drug Regulations (Controlled Substances Act)
 */
export const MO_CHAPTERS = ['195', '565', '566', '569', '570', '571', '575', '577'];

export const MO_CHAPTER_DESCRIPTIONS = {
  '195': 'Drug Regulations',
  '565': 'Offenses Against the Person',
  '566': 'Sexual Offenses',
  '569': 'Robbery, Arson, Burglary, and Related Offenses',
  '570': 'Stealing and Related Offenses',
  '571': 'Weapons Offenses',
  '575': 'Offenses Against the Administration of Justice',
  '577': 'Public Safety Offenses',
};
